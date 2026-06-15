"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Channel } from "@/lib/channels"
import { Endpoint } from "@/lib/db/schema/endpoints"
import { EndpointGroupWithEndpoints } from "@/types/endpoint-group"
import { getEndpointGroups } from "@/lib/services/endpoint-groups"
import { getEndpoints } from "@/lib/services/endpoints"
import { useToast } from "@/components/ui/use-toast"
import { EndpointTable } from "@/components/endpoint-table"
import { EndpointGroupTable } from "@/components/endpoint-group-table"
import { MessageReceiptSection } from "@/components/message-receipt-section"

export function EndpointsTabs({ initialEndpoints, channels }: { initialEndpoints: Endpoint[], channels: Channel[] }) {
  const [endpoints, setEndpoints] = useState<Endpoint[]>(initialEndpoints)
  const [groups, setGroups] = useState<EndpointGroupWithEndpoints[]>([])
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState("endpoints")
  const { toast } = useToast()

  const loadGroups = async () => {
    try {
      setLoading(true)
      const data = await getEndpointGroups()
      setGroups(data)
    } catch (error) {
      console.error('加载接口组失败:', error)
      toast({
        variant: "destructive",
        description: error instanceof Error ? error.message : "加载接口组失败"
      })
    } finally {
      setLoading(false)
    }
  }

  const loadEndpoints = async () => {
    try {
      setLoading(true)
      const data = await getEndpoints() as Endpoint[]
      setEndpoints(data)
    } catch (error) {
      console.error('加载接口失败:', error)
      toast({
        variant: "destructive",
        description: error instanceof Error ? error.message : "加载接口失败"
      })
    } finally {
      setLoading(false)
    }
  }

  const handleTabChange = (value: string) => {
    setActiveTab(value)
    if (value === "groups") {
      loadGroups()
    } else if (value === "endpoints") {
      loadEndpoints()
    }
  }

  const switchToGroupsTab = () => {
    handleTabChange("groups")
  }

  return (
    <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-4">
      <TabsList className="grid w-full max-w-lg grid-cols-3">
        <TabsTrigger value="endpoints">推送接口</TabsTrigger>
        <TabsTrigger value="groups">接口组</TabsTrigger>
        <TabsTrigger value="records">消息记录</TabsTrigger>
      </TabsList>
      <TabsContent value="endpoints">
        <Card className="bg-white/50 border-blue-100">
          <CardHeader>
            <CardTitle>推送接口</CardTitle>
            <CardDescription>
              管理所有的推送接口
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
              </div>
            ) : (
              <EndpointTable 
                endpoints={endpoints}
                onEndpointsUpdate={loadEndpoints}
                channels={channels}
                onGroupCreated={switchToGroupsTab}
              />
            )}
          </CardContent>
        </Card>
      </TabsContent>
      <TabsContent value="groups">
        <Card className="bg-white/50 border-blue-100">
          <CardHeader>
            <CardTitle>接口组</CardTitle>
            <CardDescription>
              管理多个接口的聚合组
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
              </div>
            ) : (
              <EndpointGroupTable 
                groups={groups}
                onGroupsUpdate={loadGroups}
              />
            )}
          </CardContent>
        </Card>
      </TabsContent>
      <TabsContent value="records">
        <Card className="bg-white/50 border-blue-100">
          <CardHeader>
            <CardTitle>消息记录</CardTitle>
            <CardDescription>
              查看外部系统调用平台接口后的接收与发送记录
            </CardDescription>
          </CardHeader>
          <CardContent>
            <MessageReceiptSection
              title="接收消息记录"
              defaultSourceType="all"
            />
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  )
} 
