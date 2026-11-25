import { Settings, Search, Highlighter, Target } from "lucide-react"
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

import { useTranslation } from "@/i18n/react"
import logo from "@/assets/img/logo.png"
import { TemplatesSidebar } from "./templates-sidebar"
import { version } from "../../../../package.json"

// Menu items.
const items = [
  {
    title: "options.nav.searchEngine",
    url: "/search-engine",
    icon: Search,
  },
  // "AI Configuration" (/ai-config) is hidden for now: no feature uses it yet.
  {
    title: "options.nav.recallRules",
    url: "/recall-rules",
    icon: Target,
  },
  {
    title: "options.nav.highlights",
    url: "/highlights",
    icon: Highlighter,
  },
  {
    title: "options.nav.settings",
    url: "/settings",
    icon: Settings,
  },
] as const

export function AppSidebar() {
  const location = useLocation()
  const { t } = useTranslation()
  // Example template data - replace with your actual data source and state management


  return (
    <Sidebar>
      <SidebarHeader>
        <div className="flex items-center gap-2">
          <img src={logo} alt="Logseq Copilot" className="w-10 h-10" />
          <span className="text-lg font-bold">Logseq Copilot</span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>{t("options.nav.group")}</SidebarGroupLabel>
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
                      <span>{t(item.title)}</span>
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
        <span className="text-sm text-muted-foreground">v{version}</span>
      </SidebarFooter>
    </Sidebar>
  )
}