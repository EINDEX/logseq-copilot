import { Settings, Search, FileText, Bot } from "lucide-react"
import { NavLink, useLocation } from "react-router-dom"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"

import logo from "@/assets/img/logo.png"
import { TemplatesSidebar } from "./templates-sidebar"

// Menu items.
const items = [
  {
    title: "Search Engine",
    url: "/search-engine",
    icon: Search,
  },
  {
    title: "AI Configuration",
    url: "/ai-config",
    icon: Bot,
  },
  {
    title: "Templates",
    url: "/templates",
    icon: FileText,
  },
  {
    title: "Settings",
    url: "/settings",
    icon: Settings,
  },
]

export function AppSidebar() {
  const location = useLocation()
  // Example template data - replace with your actual data source and state management


  return (
    <Sidebar>
      <SidebarHeader>
        <div className="flex items-center gap-2">
          <img src={logo} alt="Logseq Copilot" className="w-10 h-10 rounded-full" />
          <span className="text-lg font-bold">Logseq Copilot</span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Settings</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={location.pathname === item.url}
                  >
                    <NavLink to={item.url}>
                      <item.icon />
                      <span>{item.title}</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <TemplatesSidebar />
      </SidebarContent>
      <SidebarFooter>
        <span className="text-sm text-muted-foreground">v1.0.0</span>
      </SidebarFooter>
    </Sidebar>
  )
}