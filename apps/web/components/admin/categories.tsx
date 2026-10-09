'use client';

import { useMemo, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { GripVertical, Layers, Pencil, Plus, Settings2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { CategoryDto } from '@gk/types';
import { api } from '@/lib/api';
import { errMsg } from '@/lib/forms';
import { cn } from '@/lib/utils';
import { Badge, Skeleton } from '@/components/ui/data';
import { Button } from '@/components/ui/button';
import { CheckRow, Field, Input, Select, Textarea } from '@/components/ui/form';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/overlay';
import { ImageUploader } from '@/components/store/image-uploader';
import { PageHeader, ReasonDialog } from '@/components/dashboard/common';

interface Flat {
  id: string;
  parentId: string | null;
  depth: number;
  node: CategoryDto;
}

const INDENT = 28;
const MAX_DEPTH = 3;

function flatten(nodes: CategoryDto[], parentId: string | null = null, depth = 0): Flat[] {
  return nodes.flatMap((n) => [
    { id: n.id, parentId, depth, node: n },
    ...flatten(n.children ?? [], n.id, depth + 1),
  ]);
}

/** The dragged node plus all of its descendants, which move together. */
function blockOf(list: Flat[], id: string): Flat[] {
  const start = list.findIndex((f) => f.id === id);
  if (start < 0) return [];
  const depth = (list[start] as Flat).depth;
  let end = start + 1;
  while (end < list.length && (list[end] as Flat).depth > depth) end++;
  return list.slice(start, end);
}

/**
 * Re-compute the tree after a drop: moves the block to the target position, then uses the horizontal
 * drag distance to choose how deep to nest it (drag right = child of the item above, left = outdent).
 */
function moveBlock(list: Flat[], activeId: string, overId: string, deltaX: number): Flat[] | null {
  const block = blockOf(list, activeId);
  const rest = list.filter((f) => !block.some((b) => b.id === f.id));
  const overIdxRest = rest.findIndex((f) => f.id === overId);
  if (overIdxRest < 0 || block.length === 0) return null;
  const activeOrigIdx = list.findIndex((f) => f.id === activeId);
  const overOrigIdx = list.findIndex((f) => f.id === overId);
  // dropping downwards inserts after the target (and after its subtree); upwards inserts before it
  let insertAt = overOrigIdx > activeOrigIdx ? overIdxRest + 1 : overIdxRest;
  if (overOrigIdx > activeOrigIdx) {
    const overDepth = (rest[overIdxRest] as Flat).depth;
    while (insertAt < rest.length && (rest[insertAt] as Flat).depth > overDepth) insertAt++;
  }
  const head = block[0] as Flat;
  const above = rest[insertAt - 1];
  const below = rest[insertAt];
  const maxDepth = above
    ? Math.min(above.depth + 1, MAX_DEPTH - (Math.max(...block.map((b) => b.depth)) - head.depth))
    : 0;
  const minDepth = below ? below.depth : 0;
  const wanted = head.depth + Math.round(deltaX / INDENT);
  const depth = Math.max(Math.min(wanted, maxDepth), Math.min(minDepth, maxDepth));
  let parentId: string | null = null;
  if (depth > 0) {
    for (let i = insertAt - 1; i >= 0; i--) {
      if ((rest[i] as Flat).depth === depth - 1) {
        parentId = (rest[i] as Flat).id;
        break;
      }
    }
  }
  const shift = depth - head.depth;
  const moved = block.map((b, i) => ({
    ...b,
    depth: b.depth + shift,
    parentId: i === 0 ? parentId : b.parentId,
  }));
  return [...rest.slice(0, insertAt), ...moved, ...rest.slice(insertAt)];
}

function toNodes(list: Flat[]) {
  const counters = new Map<string | null, number>();
  return list.map((f) => {
    const order = counters.get(f.parentId) ?? 0;
    counters.set(f.parentId, order + 1);
    return { id: f.id, parentId: f.parentId, sortOrder: order };
  });
}

function Row({
  item,
  overlay,
  onEdit,
  onAdd,
  onDelete,
  onAttrs,
}: {
  item: Flat;
  overlay?: boolean;
  onEdit: () => void;
  onAdd: () => void;
  onDelete: () => void;
  onAttrs: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  });
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        marginLeft: item.depth * INDENT,
      }}
      className={cn(
        'group flex items-center gap-2 rounded-xl border bg-card px-2 py-2 shadow-soft',
        isDragging && !overlay && 'opacity-40',
        overlay && 'shadow-lift ring-2 ring-primary',
        !item.node.isActive && 'opacity-60',
      )}
    >
      <button
        type="button"
        className="grid size-8 cursor-grab touch-none place-content-center rounded-lg text-muted-foreground hover:bg-muted active:cursor-grabbing"
        aria-label={`Drag ${item.node.name}. Use arrow keys to reorder.`}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" />
      </button>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 text-sm font-semibold">
          {item.node.name}
          {!item.node.isActive && <Badge variant="muted">Hidden</Badge>}
        </p>
        <p className="font-mono text-[11px] text-muted-foreground">
          /{item.node.slug} · {item.node.productCount ?? 0} products
        </p>
      </div>
      <div className="flex gap-0.5 opacity-100 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
        {item.depth < MAX_DEPTH && (
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={`Add sub-category under ${item.node.name}`}
            onClick={onAdd}
          >
            <Plus />
          </Button>
        )}
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label={`Configure attributes for ${item.node.name}`}
          onClick={onAttrs}
        >
          <Settings2 />
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label={`Edit ${item.node.name}`}
          onClick={onEdit}
        >
          <Pencil />
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label={`Delete ${item.node.name}`}
          onClick={onDelete}
        >
          <Trash2 className="text-destructive" />
        </Button>
      </div>
    </div>
  );
}

function CategoryDialog({
  open,
  onOpenChange,
  category,
  parentId,
  flat,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  category: CategoryDto | null;
  parentId: string | null;
  flat: Flat[];
  onSaved: () => void;
}) {
  const [name, setName] = useState(category?.name ?? '');
  const [desc, setDesc] = useState(category?.description ?? '');
  const [image, setImage] = useState<string[]>(category?.imageUrl ? [category.imageUrl] : []);
  const [active, setActive] = useState(category?.isActive ?? true);
  const [parent, setParent] = useState<string>(
    category ? (category.parentId ?? '') : (parentId ?? ''),
  );
  const [busy, setBusy] = useState(false);
  const blocked = new Set(category ? blockOf(flat, category.id).map((b) => b.id) : []);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{category ? 'Edit category' : 'New category'}</DialogTitle>
          <DialogDescription>
            The URL slug is generated from the name when created.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              const body = {
                name,
                description: desc,
                imageUrl: image[0] ?? '',
                isActive: active,
                parentId: parent || null,
              };
              if (category) await api.admin.categories.update(category.id, body);
              else await api.admin.categories.create(body);
              toast.success(category ? 'Category updated' : 'Category created');
              onSaved();
              onOpenChange(false);
            } catch (err) {
              toast.error(errMsg(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          <Field label="Name" htmlFor="cat-name" required>
            <Input
              id="cat-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              required
            />
          </Field>
          <Field label="Parent category" htmlFor="cat-parent" hint="Up to 4 levels deep">
            <Select id="cat-parent" value={parent} onChange={(e) => setParent(e.target.value)}>
              <option value="">— Top level —</option>
              {flat
                .filter((f) => f.depth < MAX_DEPTH && !blocked.has(f.id))
                .map((f) => (
                  <option key={f.id} value={f.id}>
                    {'— '.repeat(f.depth)}
                    {f.node.name}
                  </option>
                ))}
            </Select>
          </Field>
          <Field label="Description" htmlFor="cat-desc">
            <Textarea
              id="cat-desc"
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              rows={2}
              maxLength={500}
            />
          </Field>
          <Field label="Image">
            <ImageUploader
              folder="categories"
              max={1}
              value={image}
              onChange={setImage}
              label="Image"
            />
          </Field>
          <CheckRow id="cat-active" checked={active} onCheckedChange={setActive}>
            Visible on the storefront
          </CheckRow>
          <DialogFooter>
            <Button type="submit" loading={busy} disabled={name.trim().length < 2}>
              {category ? 'Save changes' : 'Create category'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AttributesDialog({ category, onClose }: { category: CategoryDto; onClose: () => void }) {
  const { data: all } = useQuery({
    queryKey: ['attributes-all'],
    queryFn: () => api.admin.attributes.list(),
  });
  const { data: current } = useQuery({
    queryKey: ['cat-attrs-admin', category.id],
    queryFn: () => api.admin.categories.attributes(category.id),
  });
  const [sel, setSel] = useState<Record<
    string,
    { on: boolean; required: boolean; axis: boolean }
  > | null>(null);
  const [busy, setBusy] = useState(false);
  const state =
    sel ??
    Object.fromEntries(
      (all ?? []).map((a) => {
        const c = current?.find((x) => x.id === a.id);
        return [
          a.id,
          { on: !!c, required: c?.isRequired ?? false, axis: c?.isVariantAxis ?? false },
        ];
      }),
    );
  const patch = (id: string, p: Partial<{ on: boolean; required: boolean; axis: boolean }>) =>
    setSel({
      ...state,
      [id]: { ...(state[id] ?? { on: false, required: false, axis: false }), ...p },
    });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Attributes for {category.name}</DialogTitle>
          <DialogDescription>
            Variant axes (e.g. size, colour) create SKUs; other attributes describe the product.
            Sub-categories inherit these.
          </DialogDescription>
        </DialogHeader>
        {!all ? (
          <Skeleton className="h-40" />
        ) : (
          <div className="max-h-[55dvh] overflow-auto rounded-xl border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Use</th>
                  <th className="px-3 py-2">Attribute</th>
                  <th className="px-3 py-2">Required</th>
                  <th className="px-3 py-2">Variant axis</th>
                </tr>
              </thead>
              <tbody>
                {all.map((a) => {
                  const s = state[a.id];
                  return (
                    <tr key={a.id} className="border-t">
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          aria-label={`Use ${a.name}`}
                          checked={s?.on ?? false}
                          onChange={(e) => patch(a.id, { on: e.target.checked })}
                          className="size-4 accent-[hsl(var(--primary))]"
                        />
                      </td>
                      <td className="px-3 py-2 font-medium">
                        {a.name}{' '}
                        <span className="text-xs text-muted-foreground">
                          ({a.type.toLowerCase()}, {a.values.length} values)
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          aria-label={`${a.name} required`}
                          disabled={!s?.on}
                          checked={s?.required ?? false}
                          onChange={(e) => patch(a.id, { required: e.target.checked })}
                          className="size-4 accent-[hsl(var(--primary))]"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          aria-label={`${a.name} is variant axis`}
                          disabled={!s?.on}
                          checked={s?.axis ?? false}
                          onChange={(e) => patch(a.id, { axis: e.target.checked })}
                          className="size-4 accent-[hsl(var(--primary))]"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <DialogFooter>
          <Button
            loading={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await api.admin.categories.setAttributes(
                  category.id,
                  Object.entries(state)
                    .filter(([, v]) => v.on)
                    .map(([attributeId, v]) => ({
                      attributeId,
                      isRequired: v.required,
                      isVariantAxis: v.axis,
                    })),
                );
                toast.success('Attributes saved');
                onClose();
              } catch (e) {
                toast.error(errMsg(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            Save attributes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CategoryManager() {
  const qc = useQueryClient();
  const { data: tree, isLoading } = useQuery({
    queryKey: ['admin-categories'],
    queryFn: () => api.admin.categories.tree(),
  });
  const flat = useMemo(() => flatten(tree ?? []), [tree]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<{
    category: CategoryDto | null;
    parentId: string | null;
  } | null>(null);
  const [attrsFor, setAttrsFor] = useState<CategoryDto | null>(null);
  const [del, setDel] = useState<CategoryDto | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['admin-categories'] });
    void qc.invalidateQueries({ queryKey: ['categories-tree'] });
  };

  const onDragEnd = async (e: DragEndEvent) => {
    setActiveId(null);
    const { active, over, delta } = e;
    if (!over) return;
    const next = moveBlock(flat, String(active.id), String(over.id), delta.x);
    if (!next) return;
    const nodes = toNodes(next);
    const prev = nodes.every((n, i) => flat[i]?.id === n.id && flat[i]?.parentId === n.parentId);
    if (prev) return;
    try {
      await api.admin.categories.reorder(nodes);
      toast.success('Category tree updated');
    } catch (err) {
      toast.error(errMsg(err, 'Could not move that category'));
    } finally {
      refresh();
    }
  };
  const activeItem = flat.find((f) => f.id === activeId);

  return (
    <>
      <PageHeader
        title="Categories"
        description="Drag to reorder. Drag a row right to nest it under the item above, or left to move it up a level."
        actions={
          <Button onClick={() => setDialog({ category: null, parentId: null })}>
            <Plus /> New category
          </Button>
        }
      />
      {isLoading ? (
        <Skeleton className="h-96" />
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={(e: DragStartEvent) => setActiveId(String(e.active.id))}
          onDragEnd={onDragEnd}
          onDragCancel={() => setActiveId(null)}
        >
          <SortableContext items={flat.map((f) => f.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-1.5" role="tree" aria-label="Category tree">
              {flat.map((f) => (
                <Row
                  key={f.id}
                  item={f}
                  onEdit={() => setDialog({ category: f.node, parentId: f.parentId })}
                  onAdd={() => setDialog({ category: null, parentId: f.id })}
                  onDelete={() => setDel(f.node)}
                  onAttrs={() => setAttrsFor(f.node)}
                />
              ))}
            </div>
          </SortableContext>
          <DragOverlay>
            {activeItem && (
              <Row
                item={{ ...activeItem, depth: 0 }}
                overlay
                onEdit={() => undefined}
                onAdd={() => undefined}
                onDelete={() => undefined}
                onAttrs={() => undefined}
              />
            )}
          </DragOverlay>
        </DndContext>
      )}
      {flat.length === 0 && !isLoading && (
        <p className="py-10 text-center text-muted-foreground">
          <Layers className="mx-auto mb-2 size-8" />
          No categories yet.
        </p>
      )}
      {dialog && (
        <CategoryDialog
          key={dialog.category?.id ?? `new-${dialog.parentId}`}
          open
          onOpenChange={(o) => !o && setDialog(null)}
          category={dialog.category}
          parentId={dialog.parentId}
          flat={flat}
          onSaved={refresh}
        />
      )}
      {attrsFor && <AttributesDialog category={attrsFor} onClose={() => setAttrsFor(null)} />}
      <ReasonDialog
        open={!!del}
        onOpenChange={(o) => !o && setDel(null)}
        title={`Delete “${del?.name ?? ''}”?`}
        description="Only empty categories (no products, no sub-categories) can be deleted."
        confirmLabel="Delete"
        destructive
        requireReason={false}
        label=""
        onConfirm={async () => {
          await api.admin.categories.remove(del!.id);
          toast.success('Category deleted');
          refresh();
        }}
      />
    </>
  );
}
