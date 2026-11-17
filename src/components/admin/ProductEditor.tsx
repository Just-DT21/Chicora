import { useEffect, useRef, useState } from 'react'
import { Check, ImagePlus, Loader2, Trash2, Upload, X } from 'lucide-react'
import type { Category, Product } from '@shared/types'
import { api, ApiError } from '@/lib/api'
import { cn, inr } from '@/lib/format'
import { Modal } from '@/components/ui/Modal'

interface FormState {
  name: string
  description: string
  category_id: string
  price: string
  discounted_price: string
  stock_quantity: string
  is_featured: boolean
  is_new_arrival: boolean
  is_published: boolean
}

const EMPTY: FormState = {
  name: '',
  description: '',
  category_id: '',
  price: '',
  discounted_price: '',
  stock_quantity: '1',
  is_featured: false,
  is_new_arrival: true,
  is_published: true,
}

export function ProductEditor({
  open,
  product,
  categories,
  onClose,
  onSaved,
}: {
  open: boolean
  product: Product | null
  categories: Category[]
  onClose: () => void
  onSaved: (message: string) => void
}) {
  const [form, setForm] = useState<FormState>(EMPTY)
  const [images, setImages] = useState<string[]>([])
  const [urlInput, setUrlInput] = useState('')
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (!open) return
    setError(null)
    setUrlInput('')
    if (product) {
      setForm({
        name: product.name,
        description: product.description,
        category_id: product.category_id,
        price: String(product.price),
        discounted_price: product.discounted_price ? String(product.discounted_price) : '',
        stock_quantity: String(product.stock_quantity),
        is_featured: product.is_featured,
        is_new_arrival: product.is_new_arrival,
        is_published: product.is_published,
      })
      setImages(product.images)
    } else {
      setForm({ ...EMPTY, category_id: categories[0]?.id ?? '' })
      setImages([])
    }
  }, [open, product, categories])

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }))

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setUploading(true)
    setError(null)
    try {
      const { urls } = await api.admin.upload(Array.from(files))
      setImages((current) => [...current, ...urls].slice(0, 8))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not upload those images.')
    } finally {
      setUploading(false)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  const addImageUrl = () => {
    const value = urlInput.trim()
    if (!value) return
    if (!/^(https?:\/\/|\/)/.test(value)) {
      setError('Image links should start with http(s):// or /.')
      return
    }
    setImages((current) => (current.includes(value) ? current : [...current, value].slice(0, 8)))
    setUrlInput('')
    setError(null)
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)
    if (form.name.trim().length < 2) {
      setError('Give the product a name.')
      return
    }
    if (form.description.trim().length < 10) {
      setError('Add a description of at least 10 characters.')
      return
    }
    if (!form.category_id) {
      setError('Choose a category.')
      return
    }
    const price = Number(form.price)
    if (!Number.isFinite(price) || price <= 0) {
      setError('Price must be a positive amount.')
      return
    }
    const stock = Number(form.stock_quantity)
    if (!Number.isInteger(stock) || stock < 0) {
      setError('Stock must be a whole number of zero or more.')
      return
    }
    if (images.length === 0) {
      setError('Add at least one product image.')
      return
    }

    const payload = {
      name: form.name.trim(),
      description: form.description.trim(),
      category_id: form.category_id,
      price,
      discounted_price: form.discounted_price === '' ? null : Number(form.discounted_price),
      stock_quantity: stock,
      images,
      is_featured: form.is_featured,
      is_new_arrival: form.is_new_arrival,
      is_published: form.is_published,
    }

    setSaving(true)
    try {
      if (product) {
        await api.admin.updateProduct(product.id, payload)
        onSaved(`“${payload.name}” updated`)
      } else {
        await api.admin.createProduct(payload)
        onSaved(`“${payload.name}” added to the shelves`)
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save this product.')
    } finally {
      setSaving(false)
    }
  }

  const checklist = [
    { label: 'Name', done: form.name.trim().length >= 2 },
    { label: 'Description', done: form.description.trim().length >= 10 },
    { label: 'Category', done: Boolean(form.category_id) },
    { label: 'Price', done: Number(form.price) > 0 },
    { label: 'Image', done: images.length > 0 },
  ]

  return (
    <Modal
      open={open}
      onClose={onClose}
      labelledBy="editor-title"
      panelClassName="w-[calc(100vw-1.25rem)] max-w-5xl max-h-[93vh] overflow-y-auto rounded-[1.75rem] bg-warmwhite"
    >
      <form onSubmit={submit} className="max-h-[93vh] overflow-y-auto">
        <div className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-cocoa/10 bg-warmwhite/95 px-5 py-4 backdrop-blur sm:px-7">
          <div>
            <p className="text-[9px] font-extrabold uppercase tracking-[0.18em] text-amber-deep">
              {product ? 'Edit product' : 'New product'}
            </p>
            <h2 id="editor-title" className="mt-1 font-display text-2xl leading-none text-cocoa">
              {product ? product.name : 'Add something lovely'}
            </h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close editor" className="grid h-9 w-9 place-items-center rounded-full border border-cocoa/10 text-cocoa/50 hover:bg-cocoa/5 hover:text-cocoa">
            <X size={15} />
          </button>
        </div>

        <div className="grid gap-6 p-5 sm:p-7 lg:grid-cols-[1.35fr_0.65fr]">
          <div className="space-y-5">
            <section>
              <div className="flex items-center justify-between">
                <label className="field-label !mb-0">Product images</label>
                <span className="text-[10px] text-cocoa/35">{images.length}/8 · first is the cover</span>
              </div>
              <div className="mt-2 grid grid-cols-4 gap-2 sm:grid-cols-5">
                {images.map((image, index) => (
                  <div key={`${image}-${index}`} className="group relative aspect-square overflow-hidden rounded-xl border border-cocoa/10 bg-cream">
                    <img src={image} alt="" className="h-full w-full object-cover" loading="lazy" />
                    <button
                      type="button"
                      onClick={() => setImages((current) => current.filter((_, i) => i !== index))}
                      aria-label="Remove image"
                      className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-cocoa/80 text-warmwhite opacity-0 transition group-hover:opacity-100"
                    >
                      <X size={10} />
                    </button>
                    {index === 0 ? (
                      <span className="absolute bottom-1 left-1 rounded bg-cocoa/85 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-[0.08em] text-warmwhite">
                        Cover
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setImages((current) => [current[index], ...current.filter((_, i) => i !== index)])}
                        className="absolute bottom-1 left-1 rounded bg-warmwhite/90 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-[0.08em] text-cocoa opacity-0 transition group-hover:opacity-100"
                      >
                        Make cover
                      </button>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => fileInput.current?.click()}
                  disabled={uploading || images.length >= 8}
                  className="grid aspect-square place-items-center rounded-xl border border-dashed border-cocoa/25 text-cocoa/40 transition hover:border-amber hover:bg-amber/5 hover:text-amber-deep disabled:opacity-40"
                >
                  {uploading ? <Loader2 size={16} className="animate-spin" /> : <ImagePlus size={16} />}
                </button>
              </div>
              <input ref={fileInput} type="file" accept="image/*" multiple hidden onChange={(event) => handleFiles(event.target.files)} />
              <div className="mt-2 flex gap-2">
                <button type="button" onClick={() => fileInput.current?.click()} className="chip !text-[10px]">
                  <Upload size={12} /> Upload images
                </button>
                <div className="flex flex-1 items-center gap-1.5">
                  <input
                    value={urlInput}
                    onChange={(event) => setUrlInput(event.target.value)}
                    placeholder="…or paste an image URL"
                    aria-label="Image URL"
                    className="field !py-1.5 !text-[11px]"
                  />
                  <button type="button" onClick={addImageUrl} className="rounded-full border border-cocoa/15 px-3 py-1.5 text-[10px] font-bold text-cocoa/60 hover:border-cocoa/40 hover:text-cocoa">
                    Add
                  </button>
                </div>
              </div>
            </section>

            <section className="grid gap-4">
              <div>
                <label className="field-label" htmlFor="product-name">Name</label>
                <input id="product-name" value={form.name} onChange={(e) => update('name', e.target.value)} placeholder="The Clown Box" className="field" />
              </div>
              <div>
                <label className="field-label" htmlFor="product-description">Description</label>
                <textarea
                  id="product-description"
                  value={form.description}
                  onChange={(e) => update('description', e.target.value)}
                  rows={5}
                  placeholder="Tell the story of this piece — materials, size, why it is worth giving."
                  className="field resize-y"
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="field-label" htmlFor="product-category">Category</label>
                  <select id="product-category" value={form.category_id} onChange={(e) => update('category_id', e.target.value)} className="field">
                    <option value="">Choose a category</option>
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>{category.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="field-label" htmlFor="product-stock">Stock quantity</label>
                  <input id="product-stock" type="number" min={0} step={1} value={form.stock_quantity} onChange={(e) => update('stock_quantity', e.target.value)} className="field" />
                </div>
                <div>
                  <label className="field-label" htmlFor="product-price">Price (₹)</label>
                  <input id="product-price" type="number" min={0} step="0.01" value={form.price} onChange={(e) => update('price', e.target.value)} placeholder="2450" className="field" />
                </div>
                <div>
                  <label className="field-label" htmlFor="product-sale">Sale price (₹, optional)</label>
                  <input id="product-sale" type="number" min={0} step="0.01" value={form.discounted_price} onChange={(e) => update('discounted_price', e.target.value)} placeholder="Lower than price" className="field" />
                </div>
              </div>
            </section>

            <section className="grid gap-2 rounded-2xl border border-cocoa/10 bg-cream/40 p-4 sm:grid-cols-3">
              {[
                { key: 'is_featured' as const, label: 'Featured', hint: 'Shows on the home rail' },
                { key: 'is_new_arrival' as const, label: 'New arrival', hint: 'Gets a “New in” badge' },
                { key: 'is_published' as const, label: 'Published', hint: 'Visible to customers' },
              ].map((option) => (
                <label key={option.key} className="flex cursor-pointer items-start gap-2.5 rounded-xl bg-warmwhite/60 p-2.5">
                  <input
                    type="checkbox"
                    checked={form[option.key]}
                    onChange={(e) => update(option.key, e.target.checked)}
                    className="mt-0.5 h-4 w-4 accent-[#B87525]"
                  />
                  <span>
                    <span className="block text-[12px] font-bold text-cocoa">{option.label}</span>
                    <span className="block text-[9px] text-cocoa/45">{option.hint}</span>
                  </span>
                </label>
              ))}
            </section>

            {error && (
              <p role="alert" className="rounded-xl border border-cherry/25 bg-[#FDF1EC] px-3 py-2.5 text-xs font-semibold text-cherry">
                {error}
              </p>
            )}
          </div>

          <aside className="lg:sticky lg:top-4 lg:self-start">
            <p className="field-label">Storefront preview</p>
            <div className="overflow-hidden rounded-2xl border border-cocoa/10 bg-[#FFFDF8]">
              <div className="aspect-[4/5] bg-cream">
                {images[0] ? (
                  <img src={images[0]} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="grid h-full place-items-center text-[10px] font-semibold uppercase tracking-[0.14em] text-cocoa/30">
                    No image yet
                  </div>
                )}
              </div>
              <div className="p-3">
                <p className="text-[8px] font-extrabold uppercase tracking-[0.16em] text-amber-deep">
                  {categories.find((c) => c.id === form.category_id)?.name ?? 'Category'}
                </p>
                <p className="mt-1 font-display text-lg leading-tight text-cocoa">{form.name || 'Product name'}</p>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="text-sm font-bold text-cocoa">
                    {form.discounted_price ? inr(Number(form.discounted_price)) : form.price ? inr(Number(form.price)) : '₹0'}
                  </span>
                  {form.discounted_price && form.price && (
                    <span className="text-[10px] text-cocoa/35 line-through">{inr(Number(form.price))}</span>
                  )}
                </div>
                <p className="mt-1 text-[10px] text-cocoa/45">
                  {Number(form.stock_quantity) > 0 ? `${form.stock_quantity} in the shop` : 'Sold out'}
                </p>
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-cocoa/10 p-3.5">
              <p className="text-[9px] font-extrabold uppercase tracking-[0.16em] text-cocoa/40">Ready to publish</p>
              <ul className="mt-2 space-y-1.5">
                {checklist.map((item) => (
                  <li key={item.label} className="flex items-center gap-2 text-[11px]">
                    <span className={cn('grid h-4 w-4 place-items-center rounded-full', item.done ? 'bg-[#EAF0E2] text-[#53663F]' : 'bg-cream text-cocoa/25')}>
                      {item.done ? <Check size={9} /> : <span className="h-1 w-1 rounded-full bg-current" />}
                    </span>
                    <span className={item.done ? 'text-cocoa/65' : 'text-cocoa/35'}>{item.label}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2.5 text-[9px] leading-relaxed text-cocoa/35">
                The advance is calculated automatically from the sale price.
              </p>
            </div>
          </aside>
        </div>

        <div className="sticky bottom-0 flex flex-col-reverse gap-2 border-t border-cocoa/10 bg-warmwhite/95 px-5 py-4 backdrop-blur sm:flex-row sm:justify-end sm:px-7">
          <button type="button" onClick={onClose} className="btn btn-outline sm:w-auto">
            Cancel
          </button>
          <button type="submit" disabled={saving || uploading} className="btn btn-primary sm:min-w-[180px]">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            {product ? 'Save changes' : 'Add product'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
