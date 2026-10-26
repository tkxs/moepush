import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const dbName = process.env.D1_DATABASE_NAME || 'moepush-db';
const cloudflareApiToken = process.env.CLOUDFLARE_API_TOKEN;
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const projectName = process.env.PROJECT_NAME || 'moepush';

const setupWranglerConfig = () => {
    const wranglerExamplePath = path.resolve('wrangler.example.json');
    const wranglerConfigPath = path.resolve('wrangler.json');

    const wranglerConfig = fs.readFileSync(wranglerExamplePath, 'utf-8');
    const json = JSON.parse(wranglerConfig);
    json.d1_databases[0].database_name = dbName;
    json.name = projectName;
    fs.writeFileSync(wranglerConfigPath, JSON.stringify(json, null, 2));
};

const checkAndCreateDatabase = () => {
    let dbId;

    const getDatabaseId = () => {
        const dbList = execSync('wrangler d1 list --json').toString();
        const databases = JSON.parse(dbList);
        return databases.find((db: any) => db.name === dbName)?.uuid;
    }

    try {
        dbId = getDatabaseId();
    } catch (error) {
        console.error('Error listing databases:', error);
    }

    if (!dbId) {
        console.log(`Creating new D1 database: ${dbName}`);
        execSync(`wrangler d1 create "${dbName}"`);
        dbId = getDatabaseId();
        if (!dbId) {
            throw new Error('Failed to create database');
        }
    } else {
        console.log(`Database ${dbName} already exists`);
    }

    const wranglerConfigPath = path.resolve('wrangler.json');
    const wranglerConfig = JSON.parse(fs.readFileSync(wranglerConfigPath, 'utf-8'));
    wranglerConfig.d1_databases[0].database_id = dbId;
    fs.writeFileSync(wranglerConfigPath, JSON.stringify(wranglerConfig, null, 2));
};

const isBrokenMessageReceiptSchemaError = (error: unknown) => {
    if (!(error instanceof Error)) return false;
    return error.message.includes('no such table: main.users');
};

const applyMigrations = () => {
    try {
        execSync(`wrangler d1 migrations apply "${dbName}" --remote`);
    } catch (error) {
        if (!isBrokenMessageReceiptSchemaError(error)) {
            throw error;
        }

        console.log('Broken message receipt schema detected during migration. Repairing tables before retry...');
        execSync(`wrangler d1 execute "${dbName}" --remote --file=drizzle/0012_fix_message_receipt_user_fk.sql`);
        execSync(`wrangler d1 migrations apply "${dbName}" --remote`);
    }
};

const requiredTables = ['message_receipts', 'message_receipt_deliveries'];

const queryDatabase = <Row>(sql: string): Row[] => {
    const response = JSON.parse(execSync(
        `wrangler d1 execute "${dbName}" --remote --json --command "${sql}"`
    ).toString());

    if (!Array.isArray(response) || response.length === 0 || response.some(
        (result) => result?.success !== true || !Array.isArray(result.results)
    )) {
        throw new Error('Invalid D1 query result');
    }

    return response.flatMap((result) => result.results);
};

const getExistingTables = () => {
    const rows = queryDatabase<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table';");

    return requiredTables.filter((tableName) => rows.some((row) => row.name === tableName));
};

const getMessageReceiptForeignKeyTargets = () => {
    const [row] = queryDatabase<{
        receipts_user_table: string | null;
        deliveries_user_table: string | null;
    }>("SELECT (SELECT [table] FROM pragma_foreign_key_list('message_receipts') WHERE [from] = 'user_id' LIMIT 1) AS receipts_user_table, (SELECT [table] FROM pragma_foreign_key_list('message_receipt_deliveries') WHERE [from] = 'user_id' LIMIT 1) AS deliveries_user_table");

    if (!row) {
        throw new Error('D1 foreign key query returned no rows');
    }

    return {
        receiptsUserTable: row.receipts_user_table,
        deliveriesUserTable: row.deliveries_user_table,
    };
};

const ensureMessageReceiptTables = () => {
    const existingTables = getExistingTables();
    const missingTables = requiredTables.filter((tableName) => !existingTables.includes(tableName));

    if (missingTables.length > 0) {
        console.log(`Missing tables detected: ${missingTables.join(', ')}. Creating fallback tables...`);
        execSync(`wrangler d1 execute "${dbName}" --remote --file=drizzle/0011_polite_message_receipts.sql`);
    }

    const afterTables = getExistingTables();
    const stillMissing = requiredTables.filter((tableName) => !afterTables.includes(tableName));
    if (stillMissing.length > 0) {
        throw new Error(`Failed to create required tables: ${stillMissing.join(', ')}`);
    }

    const foreignKeys = getMessageReceiptForeignKeyTargets();
    if (foreignKeys.receiptsUserTable !== 'user' || foreignKeys.deliveriesUserTable !== 'user') {
        throw new Error(
            `Incorrect message receipt foreign keys: ${JSON.stringify(foreignKeys)}. ` +
            'Expected both to reference user. Refusing to rebuild receipt tables automatically.'
        );
    }

    console.log('Message receipt tables verified successfully');
};

const seedMissingPagesSecrets = (existingVariables: Record<string, unknown>) => {
    const requiredVariables = ['AUTH_SECRET', 'AUTH_GITHUB_ID', 'AUTH_GITHUB_SECRET'];
    const missingVariables = requiredVariables.filter(
        (name) => !Object.hasOwn(existingVariables, name) && !process.env[name]?.trim()
    );
    if (missingVariables.length > 0) {
        throw new Error(`Missing authentication configuration: ${missingVariables.join(', ')}`);
    }

    const variables = Object.fromEntries(
        [...requiredVariables, 'DISABLE_REGISTER']
            .filter((name) => !Object.hasOwn(existingVariables, name))
            .map((name) => [name, process.env[name] || 'false'])
    );
    if (Object.keys(variables).length === 0) {
        console.log('Preserving existing Cloudflare Pages authentication configuration');
        return;
    }

    execSync('wrangler pages secret bulk', { input: JSON.stringify(variables) });
};

const deployPages = () => {
    console.log('Deploying to Cloudflare Pages...');
    execSync('pnpm run deploy');
    console.log('Deployment completed successfully');
};

const getOrCreateProjectEnvironment = async (): Promise<Record<string, unknown>> => {
    try {
        const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects/${projectName}`, {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${cloudflareApiToken}`,
                'Content-Type': 'application/json',
            },
        });

        if (!response.ok && response.status === 404) {
            console.log(`Project ${projectName} does not exist. Creating...`);
            await createProject();
            return {};
        }
        if (!response.ok) {
            throw new Error(`Error checking project configuration: HTTP ${response.status}`);
        }

        const data = await response.json() as {
            success: boolean;
            result?: { deployment_configs?: { production?: { env_vars?: Record<string, unknown> } } };
        };
        if (!data.success || !data.result?.deployment_configs?.production) {
            throw new Error('Could not inspect Cloudflare Pages production configuration');
        }
        console.log(`Project ${projectName} already exists.`);
        return data.result.deployment_configs.production.env_vars ?? {};
    } catch (error) {
        console.error('Error checking project configuration:', error);
        throw error;
    }
};

const createProject = async () => {
    try {
        const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${cloudflareApiToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                name: projectName,
                production_branch: 'main',
            }),
        });

        if (!response.ok) {
            throw new Error(`Error creating project: ${response.statusText}`);
        }

        const data = await response.json() as { success: boolean, result: { name: string } };
        
        if (!data.success) {
            throw new Error('Failed to create project');
        }

        await new Promise(resolve => setTimeout(resolve, 5000));
        
        const verifyResponse = await fetch(
            `https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects/${projectName}`,
            {
                headers: {
                    Authorization: `Bearer ${cloudflareApiToken}`,
                    'Content-Type': 'application/json',
                },
            }
        );

        if (!verifyResponse.ok) {
            throw new Error('Project creation verification failed');
        }

        const verifyData = await verifyResponse.json() as { success: boolean };
        if (!verifyData.success) {
            throw new Error('Project creation could not be verified');
        }

        console.log(`Project ${projectName} created and verified successfully`);
    } catch (error) {
        console.error('Error creating project:', error);
        throw error;
    }
};

const main = async () => {
    try {
        setupWranglerConfig();
        const existingVariables = await getOrCreateProjectEnvironment();
        checkAndCreateDatabase();
        applyMigrations();
        ensureMessageReceiptTables();
        seedMissingPagesSecrets(existingVariables);
        deployPages();

        console.log('🎉 All deployment steps completed successfully!');
    } catch (error) {
        console.error('❌ Deployment failed:', error);
        process.exit(1);
    }
};

main();
