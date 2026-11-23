import {
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { GripVertical, Pin, Plus, Star, Trash } from "lucide-react"
import {
  DndContext,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors
} from "@dnd-kit/core"
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove
} from "@dnd-kit/sortable"
import { useState } from "react"
import { CSS } from "@dnd-kit/utilities"
import { NavLink, useLocation } from "react-router-dom"
import { useTemplates } from "@/hooks/use-templates"
import { useDefaultTemplateId } from "@/hooks/use-default-template-id"
import { useCommandShortcuts } from "@/hooks/use-command-shortcuts"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { TASK_TEMPLATE_ID, TEMPLATE_PRESETS, type TemplatePreset } from "@/utils/default-templates"
import { defaultTemplateIdItem, TemplateItemV1 } from "@/utils/storage"
import { formatBrowserShortcut, isMacPlatform } from "@/utils/clip-shortcut"
import { isPinned, resolveDefaultTemplate } from "@/utils/template-choice"

// The row actions sit over the right edge of the row, so the link keeps that
// strip free (`pr-*`): the star and the pin, plus the trash when it exists.
// They are always laid out, only their opacity changes, so the title never
// moves or sits under a button. The shortcut label lives in the same strip and
// fades out while the actions are shown, so it never takes room from the title.
const rowButton =
  'flex size-5 items-center justify-center rounded text-muted-foreground outline-none hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none'
const revealOnHover = 'opacity-0 group-hover/item:opacity-100 group-has-[:focus-visible]/item:opacity-100'
const hideOnHover = 'group-hover/item:opacity-0 group-has-[:focus-visible]/item:opacity-0'

// SortableTemplateItem component
const SortableTemplateItem = ({
  id,
  name,
  shortcut,
  isDefault,
  pinned,
  onPin,
  onDefault,
  onDelete
}: {
  id: string
  name: string
  /** The default template: the one the clip shortcut uses; always pinned. */
  isDefault: boolean
  /** Offered in the picker panel (always, for the default). */
  pinned: boolean
  onPin: (id: string, pinned: boolean) => void
  onDefault: (id: string) => void
  /** The keys of the command that clips with this template, if set. */
  shortcut?: string
  /** Without it the template is the last one and cannot be deleted. */
  onDelete?: (id: string) => void
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id });
  const location = useLocation();

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  const isActive = location.pathname === `/template/${id}`;

  return (
    // dnd-kit's attributes make this wrapper a focusable `role="button"`, which
    // Safari outlines; show a ring for keyboard focus only (keyboard drag works).
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
    >
      <SidebarMenuItem className="group/item">
        <SidebarMenuButton 
          asChild 
          className="group-hover/item:bg-accent" 
          isActive={isActive}
        >
          <NavLink to={`/template/${id}`} className={`flex items-center w-full gap-2 ${onDelete ? 'pr-[4.5rem]' : 'pr-14'}`}>
            <GripVertical {...listeners}
              className="cursor-grab active:cursor-grabbing touch-none p-1 flex items-center justify-center rounded"
              style={{ touchAction: 'none' }}
              aria-label="Drag to reorder" />
            <span className="min-w-0 flex-1 truncate text-left">{name}</span>
          </NavLink>
        </SidebarMenuButton>

        {shortcut && (
          <kbd
            className={`pointer-events-none absolute right-2 top-1/2 max-w-[4.5rem] -translate-y-1/2 truncate whitespace-nowrap text-xs font-sans text-muted-foreground transition-opacity ${hideOnHover}`}
          >
            {formatBrowserShortcut(shortcut, isMacPlatform())}
          </kbd>
        )}

        <div className="absolute right-1 top-1.5 flex items-center gap-0.5">
          <button
            type="button"
            aria-label="Default template"
            aria-pressed={isDefault}
            onClick={() => onDefault(id)}
            className={`${rowButton} ${revealOnHover}`}
          >
            <Star className={`size-3.5 ${isDefault ? 'fill-current' : ''}`} />
          </button>
          <button
            type="button"
            aria-label="Pinned"
            aria-pressed={pinned}
            // The default is always pinned.
            disabled={isDefault}
            onClick={() => onPin(id, !pinned)}
            className={`${rowButton} ${revealOnHover}`}
          >
            <Pin className={`size-3.5 ${pinned ? 'fill-current' : ''}`} />
          </button>
          {onDelete && (
            <button
              type="button"
              onClick={() => onDelete(id)}
              className={`${rowButton} ${revealOnHover}`}
            >
              <Trash className="size-3.5" />
              <span className="sr-only">Delete Template</span>
            </button>
          )}
        </div>
      </SidebarMenuItem>
    </div>

  )
}

// Template item component for drag overlay
const TemplateItem = ({ name }: { name: string }) => (
  <div className="flex items-center gap-2 p-2 bg-background border rounded-md shadow-lg">
    <GripVertical className="w-4 h-4 text-muted-foreground" />
    <span>{name}</span>
  </div>
)

export const TemplatesSidebar = () => {
  const { templates, loading, addTemplate, updateTemplate, deleteTemplate, reorderTemplates } = useTemplates();
  const defaultId = useDefaultTemplateId()
  const defaultTemplate = resolveDefaultTemplate(templates, defaultId)
  const [activeId, setActiveId] = useState<string | null>(null)
  const shortcuts = useCommandShortcuts()

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event

    if (over && active.id !== over.id) {
      const oldIndex = templates.findIndex((item) => item.id === active.id)
      const newIndex = templates.findIndex((item) => item.id === over.id)
      const newOrder = arrayMove(templates, oldIndex, newIndex)
      reorderTemplates(newOrder)
    }

    setActiveId(null)
  }

  const handleDragCancel = () => {
    setActiveId(null)
  }

  const handleAddTemplate = (preset: TemplatePreset) => {
    const newTemplate: Omit<TemplateItemV1, 'id'> = {
      name: preset.id === 'blank' ? `New Template ${templates.length + 1}` : preset.name,
      content: preset.content,
      clipNoteLocation: 'journal',
      clipNoteCustomPage: ''
    }
    addTemplate(newTemplate)
  }

  const handleDeleteTemplate = (id: string) => {
    deleteTemplate(id)
  }

  if (loading) {
    return (
      <SidebarGroup>
        <SidebarGroupLabel>Templates</SidebarGroupLabel>
        <SidebarGroupContent>
          <div className="p-4 text-center text-muted-foreground">
            Loading templates...
          </div>
        </SidebarGroupContent>
      </SidebarGroup>
    )
  }

  return (
    <SidebarGroup>
      <SidebarGroupLabel>Templates</SidebarGroupLabel>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <SidebarGroupAction>
            <Plus className="w-4 h-4" />
            <span className="sr-only">Add Template</span>
          </SidebarGroupAction>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          {TEMPLATE_PRESETS.map((preset) => (
            <DropdownMenuItem
              key={preset.id}
              className="flex-col items-start gap-1"
              onSelect={() => handleAddTemplate(preset)}
            >
              <span>{preset.name}</span>
              <pre className="max-w-full overflow-hidden text-ellipsis whitespace-pre font-mono text-[11px] leading-4 text-muted-foreground">
                {preset.content}
              </pre>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <SidebarGroupContent>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        >
          <SortableContext
            items={templates.map((t) => t.id)}
            strategy={verticalListSortingStrategy}
          >
            <SidebarMenu>
              {templates.map((template) => (
                <SortableTemplateItem
                  key={template.id}
                  id={template.id}
                  name={template.name}
                  // The default template is what `clip` uses, Task what `clip-task` does.
                  shortcut={
                    template.id === TASK_TEMPLATE_ID
                      ? shortcuts['clip-task']
                      : template.id === defaultTemplate?.id
                        ? shortcuts['clip']
                        : undefined
                  }
                  isDefault={template.id === defaultTemplate?.id}
                  pinned={isPinned(template, templates, defaultId)}
                  onPin={(templateId, pinned) => updateTemplate(templateId, { pinned })}
                  onDefault={(templateId) => void defaultTemplateIdItem.setValue(templateId)}
                  onDelete={templates.length > 1 ? handleDeleteTemplate : undefined}
                />
              ))}
            </SidebarMenu>
          </SortableContext>
          <DragOverlay>
            {activeId ? (
              <TemplateItem name={templates.find((template) => template.id === activeId)?.name || ""} />
            ) : null}
          </DragOverlay>
        </DndContext>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}