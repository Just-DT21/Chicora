import { Link } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Mail, MapPin, Phone, Store } from 'lucide-react'
import { useStore } from '@/context/StoreContext'
import { MiniGiftBox } from '@/components/GiftBox3D'

const SECTIONS = [
  {
    id: 'availability',
    number: '01',
    title: 'Product availability',
    body: [
      'Product availability is subject to actual store inventory. The website reflects the stock we believe we have on the shelf, but pieces can sell in the shop, be moved, or be found to have a small flaw during packing.',
      'If a reserved item turns out to be unavailable, we will contact you using the phone number or email on the booking and offer a replacement, store credit, or a refund of the advance.',
    ],
  },
  {
    id: 'advance',
    number: '02',
    title: 'Advance booking',
    body: [
      'A customer must pay 10% of the total product value to reserve an item. Payment is made by UPI to the shop’s published UPI ID or QR code, and the booking is confirmed only after the shop has manually verified the transaction ID (UTR).',
      'Submitting a screenshot or UTR is not the same as paying: it starts a verification check. A submitted booking holds the stock for a short, disclosed period (currently 60 minutes). If the payment cannot be verified in that time, the hold is released automatically and the stock returns to the shop.',
    ],
  },
  {
    id: 'remaining',
    number: '03',
    title: 'Remaining payment',
    body: [
      'The remaining 90% is payable at the physical store during collection. We accept the payment methods available at the counter, including cash, UPI and major cards.',
      'The remaining balance is calculated from the price shown at the time of booking, after any discount, and is displayed on your booking confirmation.',
    ],
  },
  {
    id: 'pickup',
    number: '04',
    title: 'Pickup only',
    body: [
      'CHICORA currently offers in-store pickup only. No shipping or home delivery is provided, and no courier arrangements can be made.',
      'Please bring your booking reference and the phone number used to book. If somebody else is collecting on your behalf, call us in advance so we can note it on the booking.',
    ],
  },
  {
    id: 'collection',
    number: '05',
    title: 'Product collection',
    body: [
      'Reserved items will be packed and kept for collection according to the store’s reservation policy. Paid reservations are currently held for 7 days from the booking date, unless a different period is agreed in writing.',
      'If you cannot collect within the hold period, contact us before it expires and we will do our best to extend it. Uncollected bookings may be released after the hold period ends.',
    ],
  },
  {
    id: 'returns',
    number: '06',
    title: 'No return / no refund',
    body: [
      'All sales are final. No returns or refunds are accepted once a product has been purchased, except where applicable consumer protection laws require otherwise.',
      'Because many of our products are handmade, small variations are part of the piece rather than a defect. If something is genuinely damaged or not what you reserved, speak to us when you collect it and we will make it right.',
    ],
  },
  {
    id: 'cancellation',
    number: '07',
    title: 'Cancellation',
    body: [
      'Advance payment cancellation and refund eligibility follow the store’s clearly disclosed booking policy and applicable law. Advance payments are not automatically non-refundable, and nothing on this page is intended to remove rights you have under consumer protection law.',
      'To cancel, contact the shop with your booking reference before the hold period ends. Where a refund of the advance is approved, it is returned to the UPI account it came from. If a duplicate payment is traced to the same UTR, it is refunded.',
      'If CHICORA rejects a payment or cancels a booking because we cannot fulfil it, the advance is refunded in full.',
    ],
  },
  {
    id: 'images',
    number: '08',
    title: 'Product images',
    body: [
      'Actual product appearance may vary slightly from displayed images. Colours can look different between screens, and handmade or naturally sourced items vary in grain, glaze, scent strength and finish.',
      'Photographs are taken of the real products in our shop, not of generic samples.',
    ],
  },
  {
    id: 'stock',
    number: '09',
    title: 'Stock and confirmation',
    body: [
      'A booking is confirmed only after the shop has verified the advance payment. A submitted payment screenshot or UTR is a claim pending verification, not a confirmed sale.',
      'Stock is held in the system when the booking is submitted and released if the payment is rejected, not verified in time, or the booking is cancelled. This is how we avoid overselling the same gift.',
    ],
  },
  {
    id: 'contact',
    number: '10',
    title: 'Contact',
    body: [
      'Questions about a reservation, a refund, or a very specific gift? Contact the shop directly. We are small, and a human will reply.',
    ],
  },
]

export function Terms() {
  const { config } = useStore()
  const store = config?.store

  return (
    <>
      <section className="relative pb-10 pt-32 sm:pt-40">
        <div className="container-x">
          <Link to="/" className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-cocoa/45 transition hover:text-cocoa">
            <ArrowLeft size={13} /> Back to the shop
          </Link>
          <div className="mt-8 grid gap-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
            <div>
              <p className="eyebrow">The important bits</p>
              <h1 className="display-lg mt-4 max-w-2xl text-cocoa">
                The fine print,
                <br />
                in <span className="italic text-amber-deep">friendly type.</span>
              </h1>
            </div>
            <div className="flex items-start gap-3 rounded-2xl border border-cocoa/10 bg-warmwhite/60 p-4">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-amber/20 text-amber-deep">
                <Store size={15} />
              </span>
              <p className="text-xs leading-relaxed text-cocoa/60">
                CHICORA is a physical gift shop. You browse and reserve online; you pay the balance and collect the gift
                from the counter. No parcels, no couriers, no mystery boxes in the post.
              </p>
            </div>
          </div>
          <p className="mt-6 max-w-2xl text-sm leading-relaxed text-cocoa/60">
            These terms apply to every advance reservation made on this website. They are written to be read, not to
            hide behind. Last updated November 2026.
          </p>
        </div>
      </section>

      <section className="container-x pb-20">
        <div className="grid gap-10 lg:grid-cols-[220px_1fr]">
          <aside className="hidden lg:block">
            <nav aria-label="Terms sections" className="sticky top-28 border-t border-cocoa/15 pt-4">
              {SECTIONS.map((section) => (
                <a
                  key={section.id}
                  href={`#${section.id}`}
                  className="group flex items-baseline gap-3 py-2 text-[12px] text-cocoa/55 transition hover:text-cocoa"
                >
                  <span className="font-mono text-[10px] text-amber-deep/70">{section.number}</span>
                  <span className="leading-snug">{section.title}</span>
                </a>
              ))}
              <Link
                to="/catalogue"
                className="mt-5 inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-cocoa"
              >
                Explore the collection <ArrowRight size={12} />
              </Link>
            </nav>
          </aside>

          <div className="max-w-3xl">
            <div className="space-y-10">
              {SECTIONS.map((section) => (
                <section key={section.id} id={section.id} className="scroll-mt-28 border-t border-cocoa/12 pt-6">
                  <div className="flex items-baseline gap-4">
                    <span className="font-mono text-[11px] tracking-wider text-amber-deep">{section.number}</span>
                    <h2 className="font-display text-2xl leading-tight tracking-[-0.02em] text-cocoa sm:text-[1.7rem]">
                      {section.title}
                    </h2>
                  </div>
                  <div className="mt-3 space-y-3 pl-8 text-sm leading-[1.75] text-cocoa/65">
                    {section.body.map((paragraph) => (
                      <p key={paragraph.slice(0, 32)}>{paragraph}</p>
                    ))}
                    {section.id === 'contact' && (
                      <div className="mt-4 grid gap-3 rounded-2xl border border-cocoa/10 bg-cream/50 p-5 sm:grid-cols-2">
                        <a href={`tel:${(store?.phone ?? '').replace(/\s/g, '')}`} className="flex items-start gap-3 text-cocoa/75 transition hover:text-cocoa">
                          <Phone size={15} className="mt-0.5 shrink-0 text-amber-deep" />
                          <span>
                            <span className="block text-[9px] font-bold uppercase tracking-[0.16em] text-cocoa/40">Phone</span>
                            <span className="mt-0.5 block font-semibold">{store?.phone ?? '+91 98765 43210'}</span>
                          </span>
                        </a>
                        <a href={`mailto:${store?.email ?? 'hello@chicora.in'}`} className="flex items-start gap-3 text-cocoa/75 transition hover:text-cocoa">
                          <Mail size={15} className="mt-0.5 shrink-0 text-amber-deep" />
                          <span>
                            <span className="block text-[9px] font-bold uppercase tracking-[0.16em] text-cocoa/40">Email</span>
                            <span className="mt-0.5 block font-semibold">{store?.email ?? 'hello@chicora.in'}</span>
                          </span>
                        </a>
                        <div className="flex items-start gap-3 text-cocoa/75 sm:col-span-2">
                          <MapPin size={15} className="mt-0.5 shrink-0 text-amber-deep" />
                          <span>
                            <span className="block text-[9px] font-bold uppercase tracking-[0.16em] text-cocoa/40">The shop</span>
                            <span className="mt-0.5 block font-semibold">{store?.address ?? '14, Palm Court Lane, Indiranagar, Bengaluru 560038'}</span>
                            <span className="mt-0.5 block text-xs text-cocoa/50">{store?.hours ?? 'Mon–Sat, 11:00–20:00 · Sun, 12:00–18:00'}</span>
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </section>
              ))}
            </div>

            <div className="mt-12 overflow-hidden rounded-3xl bg-cocoa p-6 text-warmwhite sm:p-8">
              <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-4">
                  <MiniGiftBox className="mt-1 h-10 w-10 shrink-0" />
                  <div>
                    <p className="font-display text-2xl leading-tight">Reserve something lovely.</p>
                    <p className="mt-1 max-w-sm text-xs leading-relaxed text-warmwhite/55">
                      10% now, the rest at the counter. We will have it wrapped and waiting.
                    </p>
                  </div>
                </div>
                <Link to="/catalogue" className="btn btn-amber shrink-0">
                  Explore the collection <ArrowRight size={14} />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
