import { useState } from 'react';
import { FolderTree, Pencil, Plus, Power, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { ConfirmDialog, Modal } from '@/components/ui/Modal';
import { SelectField, TextAreaField, TextField } from '@/components/ui/Field';
import { EmptyState, ErrorState, SkeletonRows } from '@/components/ui/Feedback';
import { useToast } from '@/components/ui/Toast';
import { useAdminCategories, useAdminCategoryMutations } from '@/hooks/queries';
import { ApiError } from '@/lib/api';
import { cn, pluralise } from '@/lib/utils';
import type { Category } from '@/lib/types';

const ICON_OPTIONS = [
  { value: 'code', label: 'Code' },
  { value: 'palette', label: 'Design' },
  { value: 'database', label: 'Data' },
  { value: 'cloud', label: 'Cloud' },
  { value: 'languages', label: 'Languages' },
  { value: 'briefcase', label: 'Business' },
  { value: 'music', label: 'Music' },
  { value: 'camera', label: 'Media' },
  { value: 'heart', label: 'Wellbeing' },
  { value: 'book', label: 'Academic' },
];

export default function AdminCategoriesPage() {
  const toast = useToast();
  const { data: categories, isLoading, isError, error, refetch } = useAdminCategories();
  const { create, update, remove } = useAdminCategoryMutations();

  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [deleting, setDeleting] = useState<Category | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [icon, setIcon] = useState('code');
  const [color, setColor] = useState('#6366F1');
  const [sortOrder, setSortOrder] = useState('0');

  const openCreate = () => {
    setName('');
    setDescription('');
    setIcon('code');
    setColor('#6366F1');
    setSortOrder(String((categories?.length ?? 0) * 10));
    setFormError(null);
    setCreateOpen(true);
  };

  const submitCreate = async () => {
    setFormError(null);
    if (name.trim().length < 2) {
      setFormError('Give the category a name of at least 2 characters.');
      return;
    }
    try {
      await create.mutateAsync({
        name: name.trim(),
        description: description.trim() || undefined,
        icon,
        color,
        sortOrder: Number(sortOrder) || 0,
      });
      toast.success('Category created', `${name.trim()} is now available to members.`);
      setCreateOpen(false);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'We could not create that category.');
    }
  };

  const submitEdit = async () => {
    if (!editing) return;
    try {
      await update.mutateAsync({
        id: editing.id,
        name: editing.name,
        description: editing.description ?? undefined,
        isActive: editing.isActive,
      });
      toast.success('Category updated');
      setEditing(null);
    } catch (err) {
      toast.error('Could not update', err instanceof ApiError ? err.message : undefined);
    }
  };

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader
          title="Skill taxonomy"
          description="Categories group the skills members pick from. Renaming affects display only; slugs stay stable so existing links keep working."
          icon={<FolderTree className="h-4 w-4" aria-hidden="true" />}
          action={
            <Button size="sm" onClick={openCreate} leftIcon={<Plus className="h-3.5 w-3.5" aria-hidden="true" />}>
              New category
            </Button>
          }
        />
        <CardBody>
          {isError ? (
            <ErrorState error={error} onRetry={() => void refetch()} compact />
          ) : isLoading ? (
            <SkeletonRows count={8} />
          ) : !categories || categories.length === 0 ? (
            <EmptyState
              compact
              icon={<FolderTree className="h-6 w-6" aria-hidden="true" />}
              title="No categories yet"
              description="Create the first category so members have somewhere to file their skills."
              action={
                <Button size="sm" onClick={openCreate} leftIcon={<Plus className="h-3.5 w-3.5" aria-hidden="true" />}>
                  New category
                </Button>
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[44rem] text-sm">
                <caption className="sr-only">Skill categories</caption>
                <thead>
                  <tr className="border-b text-left">
                    <th scope="col" className="px-3 py-3 font-semibold">
                      Category
                    </th>
                    <th scope="col" className="px-3 py-3 font-semibold">
                      Slug
                    </th>
                    <th scope="col" className="px-3 py-3 font-semibold">
                      Skills
                    </th>
                    <th scope="col" className="px-3 py-3 font-semibold">
                      Status
                    </th>
                    <th scope="col" className="px-3 py-3 text-right font-semibold">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {categories.map((category) => (
                    <tr key={category.id} className="transition-colors hover:bg-[rgb(var(--ss-border)/0.25)]">
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2.5">
                          {category.color ? (
                            <span
                              className="h-8 w-8 shrink-0 rounded-lg"
                              style={{ backgroundColor: category.color }}
                              aria-hidden="true"
                            />
                          ) : null}
                          <div className="min-w-0">
                            <p className="font-medium">{category.name}</p>
                            {category.description ? (
                              <p className="ss-clamp-1 text-xs ss-subtle">{category.description}</p>
                            ) : null}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 font-mono text-xs ss-subtle">{category.slug}</td>
                      <td className="px-3 py-3">
                        <span className="text-sm font-medium tabular-nums">{category.skillCount}</span>
                        <span className="ml-1.5 text-xs ss-subtle">
                          {pluralise(category.teacherCount, 'teacher')}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <Badge variant={category.isActive ? 'success' : 'neutral'}>
                          {category.isActive ? 'active' : 'hidden'}
                        </Badge>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setEditing(category)}
                            aria-label={`Edit ${category.name}`}
                            leftIcon={<Pencil className="h-3.5 w-3.5" aria-hidden="true" />}
                          >
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            aria-label={`${category.isActive ? 'Hide' : 'Show'} ${category.name}`}
                            onClick={() =>
                              update.mutate(
                                { id: category.id, isActive: !category.isActive },
                                {
                                  onSuccess: () =>
                                    toast.success(
                                      category.isActive ? 'Category hidden' : 'Category shown',
                                      category.isActive
                                        ? 'It no longer appears in the skill picker for new entries.'
                                        : 'It is available again.',
                                    ),
                                },
                              )
                            }
                            leftIcon={<Power className="h-3.5 w-3.5" aria-hidden="true" />}
                          >
                            {category.isActive ? 'Hide' : 'Show'}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10"
                            disabled={category.skillCount > 0}
                            title={
                              category.skillCount > 0
                                ? 'Move or delete its skills before deleting the category'
                                : undefined
                            }
                            onClick={() => setDeleting(category)}
                            aria-label={`Delete ${category.name}`}
                            leftIcon={<Trash2 className="h-3.5 w-3.5" aria-hidden="true" />}
                          >
                            Delete
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardBody className="text-sm ss-muted">
          <p className="font-medium text-[rgb(var(--ss-text))]">How to retire a category safely</p>
          <p className="mt-1.5">
            Categories with skills attached cannot be deleted, because members' profiles reference those skills.
            Hide the category instead — it disappears from the picker for new entries, while existing profiles
            keep working. Once its skills have been moved, deletion becomes available.
          </p>
        </CardBody>
      </Card>

      {/* Create */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="New skill category"
        description="Members pick from these when adding skills to their profile."
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submitCreate} loading={create.isPending}>
              Create category
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {formError ? (
            <p role="alert" className="rounded-lg border border-rose-500/35 bg-rose-50/60 px-3 py-2 text-sm text-rose-700 dark:bg-rose-500/5 dark:text-rose-300">
              {formError}
            </p>
          ) : null}
          <TextField
            label="Name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={60}
            required
            placeholder="e.g. Data and analytics"
            hint="The URL slug is generated from this and cannot be changed later."
          />
          <TextAreaField
            label="Description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            maxLength={200}
            showCount
            placeholder="What kinds of skills belong in this category?"
          />
          <div className="grid gap-4 sm:grid-cols-3">
            <SelectField
              label="Icon"
              value={icon}
              onChange={(event) => setIcon(event.target.value)}
              options={ICON_OPTIONS}
            />
            <div>
              <label htmlFor="category-color" className="ss-label">
                Colour
              </label>
              <input
                id="category-color"
                type="color"
                className="h-11 w-full cursor-pointer rounded-xl border bg-[rgb(var(--ss-bg-alt))] px-1"
                value={color}
                onChange={(event) => setColor(event.target.value)}
              />
            </div>
            <TextField
              label="Sort order"
              type="number"
              value={sortOrder}
              onChange={(event) => setSortOrder(event.target.value)}
              hint="Lower numbers appear first."
            />
          </div>
        </div>
      </Modal>

      {/* Edit */}
      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={editing ? `Edit ${editing.name}` : 'Edit category'}
        description="The slug cannot be changed, so existing links keep working."
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button onClick={submitEdit} loading={update.isPending}>
              Save changes
            </Button>
          </>
        }
      >
        {editing ? (
          <div className="space-y-4">
            <TextField
              label="Name"
              value={editing.name}
              onChange={(event) => setEditing({ ...editing, name: event.target.value })}
              maxLength={60}
              required
            />
            <TextField label="Slug" value={editing.slug} disabled hint="Permanent." />
            <TextAreaField
              label="Description"
              value={editing.description ?? ''}
              onChange={(event) => setEditing({ ...editing, description: event.target.value })}
              maxLength={200}
              showCount
            />
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 rounded"
                checked={editing.isActive}
                onChange={(event) => setEditing({ ...editing, isActive: event.target.checked })}
              />
              <span className="text-sm">
                Active
                <span className="mt-0.5 block text-xs ss-muted">
                  When inactive, it is hidden from the picker for new skill entries.
                </span>
              </span>
            </label>
            <p
              className={cn(
                'rounded-lg border px-3 py-2 text-xs ss-muted',
                editing.skillCount > 0 && 'border-amber-500/35 bg-amber-50/50 dark:bg-amber-500/5',
              )}
            >
              {editing.skillCount} {pluralise(editing.skillCount, 'skill')} currently reference this category.
              Renaming or hiding it does not affect them.
            </p>
          </div>
        ) : null}
      </Modal>

      {/* Delete */}
      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={() => {
          if (!deleting) return;
          remove.mutate(deleting.id, {
            onSuccess: () => {
              toast.success('Category deleted');
              setDeleting(null);
            },
            onError: (err) => toast.error('Could not delete', err instanceof ApiError ? err.message : undefined),
          });
        }}
        title={deleting ? `Delete ${deleting.name}?` : 'Delete category?'}
        description="This cannot be undone. The category is only deletable when no skills reference it."
        confirmLabel="Delete category"
        destructive
        loading={remove.isPending}
      />
    </div>
  );
}
