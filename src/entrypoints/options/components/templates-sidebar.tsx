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
import { GripVertical, Plus, Trash } from "lucide-react"
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

// Template type definition
interface TemplateItem {
  id: string
  name: string
}

// SortableTemplateItem component
const SortableTemplateItem = ({
  id,
  name,
  onDelete
}: {
  id: string
  name: string
  onDelete: (id: string) => void
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <SidebarMenuItem className="group/item">
        <SidebarMenuButton className="group-hover/item:bg-accent">
          <div className="flex items-center w-full gap-2">
            <GripVertical {...listeners}
              className="cursor-grab active:cursor-grabbing touch-none p-1 flex items-center justify-center  rounded"
              style={{ touchAction: 'none' }}
              aria-label="Drag to reorder" />
            <span className="flex-grow text-left">{name}</span>
          </div>
        </SidebarMenuButton>

        <SidebarMenuAction
          onClick={() => onDelete(id)}
          className="hidden group-hover/item:block"
        >
          <Trash className="w-4 h-4" />
          <span className="sr-only">Delete Template</span>
        </SidebarMenuAction>
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
  const [templates, setTemplates] = useState<TemplateItem[]>([
    { id: "template-1", name: "Template 2" },
    { id: "template-2", name: "Template 1" },
    { id: "template-3", name: "Template" },
    { id: "default", name: "Default" },
  ])

  const [activeId, setActiveId] = useState<string | null>(null)

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
      setTemplates((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id)
        const newIndex = items.findIndex((item) => item.id === over.id)

        return arrayMove(items, oldIndex, newIndex)
      })
    }

    setActiveId(null)
  }

  const handleDragCancel = () => {
    setActiveId(null)
  }

  const handleAddTemplate = () => {
    const newId = `template-${Date.now()}`
    const newTemplate: TemplateItem = {
      id: newId,
      name: `New Template ${templates.length + 1}`
    }
    setTemplates([newTemplate, ...templates])
  }

  const handleDeleteTemplate = (id: string) => {
    setTemplates((items) => items.filter((item) => item.id !== id))
  }

  return (
    <SidebarGroup>
      <SidebarGroupLabel>Templates</SidebarGroupLabel>
      <SidebarGroupAction onClick={handleAddTemplate}>
        <Plus className="w-4 h-4" />
        <span className="sr-only">Add Template</span>
      </SidebarGroupAction>
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
                  onDelete={handleDeleteTemplate}
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