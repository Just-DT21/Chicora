import { useMemo, useState } from 'react'
import { Loader2, Pencil, Plus, Search, Tags, Trash2, TriangleAlert, X } from 'lucide-react'
import type { Category, Product } from '@shared/types'
import { api, ApiError } from '@/lib/api'
import { cn, inr } from '@/lib/format'
import { useStore } from '@/context/StoreContext'
import { Modal } from '@/components/ui/Modal'
import { EmptyState, Toggle } from './Shared'

export function Inventory({
  products,
  categories,
  lowStockThreshold,
  onReload,
  onEdit,
  onAdd,
}: {
  products: Product[]
  categories: Category[]
  lowStockThreshold: number
  onReload: (silent?: boolean) => Promise<void>
  onEdit: (product: Product) => void
  onAdd: () => void
}) {
  const { toast } = useStore()
  const [query, setQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [showCategories, setShowCategories] = useState(false)
  const [deleting, setDeleting] = useState<Product | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [removing, setRemoving] = useState(false)
  const [newCategory, setNewCategory] = useState('')
  const [categoryBusy, setCategoryBusy] = useState(false)

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase()
    return products.filter((product) => {
      if (categoryFilter !== 'all' && product.category_id !== categoryFilter) return false
      if (!term) return true
      return `${product.name} ${product.description} ${product.category_name ?? ''}`.toLowerCase().includes(term)
    })
  }, [products, query, categoryFilter])

  const lowStock = products.filter((p) => p.stock_quantity > 0 && p.stock_quantity <= lowStockThreshold)
  const counts = useMemo(() => {
    const map = new Map<string, number>()
    for (const product of products) map.set(product.category_id, (map.get(product.category_id) ?? 0) + 1)
    return map
  }, [products])

  const togglePublished = async (product: Product) => {
    setBusyId(product.id)
    try {
      await api.admin.updateProduct(product.id, { is_published: !product.is_published })
      await onReload(true)
      toast(product.is_published ? 'Product unpublished' : 'Product published', product.name, 'success')
    } catch (error) {
      toast('Could not change visibility', error instanceof Error ? error.message : undefined, 'error')
    } finally {
      setBusyId(null)
    }
  }

  const confirmDelete = async () => {
    if (!deleting) return
    setRemoving(true)
    try {
      await api.admin.deleteProduct(deleting.id)
      await onReload(true)
      toast('Product deleted', deleting.name, 'success')
      setDeleting(null)
    } catch (error) {
      toast('Could not delete product', error instanceof ApiError ? error.message : undefined, 'error')
    } finally {
      setRemoving(false)
    }
  }

  const addCategory = async (event: React.FormEvent) => {
    event.preventDefault()
    if (newCategory.trim().length < 2) return
    setCategoryBusy(true)
    try {
      await api.admin.createCategory(newCategory.trim())
      setNewCategory('')
      await onReload(true)
      toast('Category added', newCategory.trim(), 'success')
    } catch (error) {
      toast('Could not add category', error instanceof Error ? error.message : undefined, 'error')
    } finally {
      setCategoryBusy(false)
    }
  }

  const removeCategory = async (category: Category) => {
    setCategoryBusy(true)
    try {
      await api.admin.deleteCategory(category.id)
      await onReload(true)
      toast('Category removed', category.name, 'success')
    } catch (error) {
      toast('Could not remove category', error instanceof Error ? error.message : undefined, 'error')
    } finally {
      setCategoryBusy(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-[9px] font-extrabold uppercase tracking-[0.2em] text-amber-deep">The shelves</p>
          <h2 className="mt-2 font-display text-[2rem] leading-[1.02] tracking-[-0.03em] text-cocoa">
            {products.length} products
          </h2>
          <p className="mt-1 text-xs text-cocoa/45">
            {products.filter((p) => p.is_published).length} published · {products.filter((p) => !p.is_published).length} drafts
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setShowCategories((v) => !v)} className="btn btn-outline !py-2.5 !text-[10px]">
            <Tags size={13} /> Categories
          </button>
          <button onClick={onAdd} className="btn btn-primary !py-2.5 !text-[10px]">
            <Plus size={13} /> Add product
          </button>
        </div>
      </div>

      {lowStock.length > 0 && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber/50 bg-amber/10 px-4 py-3">
          <TriangleAlert size={16} className="mt-0.5 shrink-0 text-amber-deep" />
          <p className="text-xs leading-relaxed text-cocoa/70">
            <strong className="font-bold text-cocoa">Low stock:</strong>{' '}
            {lowStock.slice(0, 4).map((p) => `${p.name} (${p.stock_quantity})`).join(' · ')}
            {lowStock.length > 4 && ` and ${lowStock.length - 4} more`}. Restock or unpublish them before the weekend.
          </p>
        </div>
      )}

      {showCategories && (
        <div className="rounded-2xl border border-cocoa/10 bg-[#FFFDF8] p-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-display text-lg text-cocoa">Gift categories</h3>
              <p className="text-[10px] text-cocoa/40">Add a new shelf. Delete only empty ones.</p>
            </div>
            <button onClick={() => setShowCategories(false)} aria-label="Close categories" className="grid h-8 w-8 place-items-center rounded-full text-cocoa/40 hover:bg-cocoa/5 hover:text-cocoa">
              <X size={14} />
            </button>
          </div>
          <div className="mt-3 grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
            <ul className="grid gap-2 sm:grid-cols-2">
              {categories.map((category) => {
                const used = counts.get(category.id) ?? 0
                return (
                  <li key={category.id} className="flex items-center justify-between gap-2 rounded-xl border border-cocoa/8 bg-cream/40 px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-[12px] font-semibold text-cocoa">{category.name}</p>
                      <p className="text-[9px] text-cocoa/40">{used} product{used === 1 ? '' : 's'}</p>
                    </div>
                    <button
                      onClick={() => removeCategory(category)}
                      disabled={used > 0 || categoryBusy}
                      title={used > 0 ? 'Move or delete its products first' : 'Delete category'}
                      className="grid h-7 w-7 place-items-center rounded-full text-cocoa/35 transition hover:bg-cherry/10 hover:text-cherry disabled:cursor-not-allowed disabled:opacity-25 disabled:hover:bg-transparent"
                      aria-label={`Delete ${category.name}`}
                    >
                      <Trash2 size={12} />
                    </button>
                  </li>
                )
              })}
            </ul>
            <form onSubmit={addCategory} className="rounded-xl border border-dashed border-cocoa/20 p-3">
              <label className="field-label" htmlFor="new-category">
                New category
              </label>
              <input
                id="new-category"
                value={newCategory}
                onChange={(event) => setNewCategory(event.target.value)}
                placeholder="e.g. Housewarming"
                className="field !py-2 !text-xs"
              />
              <button type="submit" disabled={categoryBusy || newCategory.trim().length < 2} className="btn btn-primary mt-2 w-full !py-2 !text-[10px]">
                {categoryBusy ? <Loader2 size={12} className="animate-spin" /> : 'Add category'}
              </button>
            </form>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-cocoa/10 bg-[#FFFDF8]">
        <div className="flex flex-col gap-3 border-b border-cocoa/10 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-1 items-center gap-2 rounded-full border border-cocoa/12 px-3 py-2">
            <Search size={14} className="shrink-0 text-cocoa/35" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search products…"
              aria-label="Search inventory"
              className="w-full bg-transparent text-xs text-cocoa outline-none placeholder:text-cocoa/35"
            />
          </div>
          <select
            value={categoryFilter}
            onChange={(event) => setCategoryFilter(event.target.value)}
            aria-label="Filter inventory by category"
            className="rounded-full border border-cocoa/12 bg-transparent px-3 py-2 text-xs font-semibold text-cocoa/70 outline-none"
          >
            <option value="all">All categories</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </div>

        {filtered.length === 0 ? (
          <div className="p-4">
            <EmptyState
              title="No products here."
              description="Adjust the search or add something new to the shelves."
              action={
                <button onClick={onAdd} className="btn btn-primary">
                  <Plus size={13} /> Add product
                </button>
              }
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base min-w-[820px]">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Category</th>
                  <th>Price</th>
                  <th>Stock</th>
                  <th>Status</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((product) => (
                  <tr key={product.id}>
                    <td>
                      <div className="flex items-center gap-3">
                        <div className="h-11 w-11 shrink-0 overflow-hidden rounded-lg border border-cocoa/8 bg-cream">
                          <img src={product.images[0]} alt="" className="h-full w-full object-cover" loading="lazy" />
                        </div>
                        <div className="min-w-0">
                          <p className="max-w-[220px] truncate text-[13px] font-semibold text-cocoa">{product.name}</p>
                          <div className="mt-0.5 flex gap-1.5 text-[9px] font-bold uppercase tracking-[0.08em] text-cocoa/35">
                            {product.is_featured && <span className="text-amber-deep">Loved</span>}
                            {product.is_new_arrival && <span className="text-sage">New</span>}
                            {product.discounted_price && <span className="text-cherry">Sale</span>}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="whitespace-nowrap text-[12px] text-cocoa/55">{product.category_name}</td>
                    <td>
                      <p className="text-[12px] font-semibold text-cocoa">{inr(product.discounted_price ?? product.price)}</p>
                      {product.discounted_price && (
                        <p className="text-[10px] text-cocoa/35 line-through">{inr(product.price)}</p>
                      )}
                    </td>
                    <td>
                      <span
                        className={cn(
                          'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold',
                          product.stock_quantity === 0
                            ? 'bg-[#FBE4DF] text-cherry'
                            : product.stock_quantity <= lowStockThreshold
                              ? 'bg-amber/20 text-amber-deep'
                              : 'bg-[#EAF0E2] text-[#53663F]',
                        )}
                      >
                        {product.stock_quantity === 0 ? 'Out' : product.stock_quantity}
                      </span>
                    </td>
                    <td>
                      <div className="flex items-center gap-2 whitespace-nowrap">
                        <Toggle
                          checked={product.is_published}
                          onChange={() => togglePublished(product)}
                          disabled={busyId === product.id}
                          label={`${product.is_published ? 'Unpublish' : 'Publish'} ${product.name}`}
                        />
                        <span className="text-[10px] font-semibold text-cocoa/45">
                          {busyId === product.id ? '…' : product.is_published ? 'Live' : 'Draft'}
                        </span>
                      </div>
                    </td>
                    <td>
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => onEdit(product)}
                          className="inline-flex items-center gap-1.5 rounded-full border border-cocoa/12 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.08em] text-cocoa/60 transition hover:border-cocoa/30 hover:text-cocoa"
                        >
                          <Pencil size={11} /> Edit
                        </button>
                        <button
                          onClick={() => setDeleting(product)}
                          aria-label={`Delete ${product.name}`}
                          className="grid h-7 w-7 place-items-center rounded-full text-cocoa/30 transition hover:bg-cherry/10 hover:text-cherry"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        panelClassName="max-w-md rounded-3xl bg-warmwhite p-6"
      >
        <p className="eyebrow">Careful now</p>
        <h3 className="mt-2 font-display text-2xl text-cocoa">Delete “{deleting?.name}”?</h3>
        <p className="mt-2 text-sm leading-relaxed text-cocoa/55">
          This removes the product from the website and the dashboard. Existing booking records keep their item
          snapshots, so past orders stay intact. This cannot be undone.
        </p>
        <div className="mt-5 flex gap-2">
          <button onClick={() => setDeleting(null)} className="btn btn-outline flex-1">
            Keep it
          </button>
          <button onClick={confirmDelete} disabled={removing} className="btn flex-1 !bg-cherry !text-warmwhite">
            {removing ? <Loader2 size={14} className="animate-spin" /> : 'Delete product'}
          </button>
        </div>
      </Modal>
    </div>
  )
}
