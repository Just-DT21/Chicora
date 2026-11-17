import type { Product, Category } from '../shared/types'

type SeedProduct = Omit<Product, 'id' | 'category_id' | 'created_at' | 'updated_at'> & {
  categorySlug: string
  daysAgo: number
}

export const SEED_CATEGORIES: { name: string; slug: string }[] = [
  { name: 'Birthday Gifts', slug: 'birthday-gifts' },
  { name: 'Cute Gifts', slug: 'cute-gifts' },
  { name: 'Personalized Gifts', slug: 'personalized-gifts' },
  { name: 'Accessories', slug: 'accessories' },
  { name: 'Soft Toys', slug: 'soft-toys' },
  { name: 'Decorative Gifts', slug: 'decorative-gifts' },
  { name: 'Couple Gifts', slug: 'couple-gifts' },
  { name: 'Surprise Boxes', slug: 'surprise-boxes' },
  { name: 'Other', slug: 'other' },
]

const detail = (slug: string) => `/products/${slug}.svg`

export const SEED_PRODUCTS: SeedProduct[] = [
  {
    name: 'The Clown Box',
    description:
      'Our signature gift box: a hand-wrapped amber cube with a circus-red bow, confetti tissue and a little brass tag you can have engraved. Every box is packed in the shop, the morning you collect it. Tell us the occasion at the counter and we will write the card for you.',
    price: 2450,
    discounted_price: null,
    stock_quantity: 8,
    images: ['/products/gift-box.svg', '/products/wrap-detail.svg', '/products/tag-detail.svg'],
    is_featured: true,
    is_new_arrival: true,
    is_published: true,
    categorySlug: 'surprise-boxes',
    daysAgo: 2,
  },
  {
    name: 'Sunday Candle No. 4',
    description:
      'Hand-poured soy wax in a ribbed clay vessel, scented with fig leaf, warm amber and a whisper of smoke. Roughly 45 hours of slow burning. The vessel becomes a small pen pot once the candle is done.',
    price: 1180,
    discounted_price: 890,
    stock_quantity: 14,
    images: ['/products/candle.svg', '/products/wrap-detail.svg'],
    is_featured: true,
    is_new_arrival: true,
    is_published: true,
    categorySlug: 'decorative-gifts',
    daysAgo: 5,
  },
  {
    name: 'Mochi the Very Soft Bunny',
    description:
      'A long-eared, floppy-footed companion made from recycled velvet plush. Mochi is roughly 34cm tall, weighted at the base, and perfectly designed to be carried around by one ear. Machine washable at 30°.',
    price: 1890,
    discounted_price: null,
    stock_quantity: 5,
    images: ['/products/bunny.svg', '/products/tag-detail.svg'],
    is_featured: true,
    is_new_arrival: false,
    is_published: true,
    categorySlug: 'soft-toys',
    daysAgo: 18,
  },
  {
    name: 'Two Mugs, One Morning',
    description:
      'A pair of hand-thrown stoneware mugs in toasted clay and cream, with hand-painted amber rims. A couple gift that actually gets used: they hold 300ml, stack neatly, and are dishwasher safe (though they prefer a hand wash).',
    price: 2200,
    discounted_price: null,
    stock_quantity: 3,
    images: ['/products/mugs.svg', '/products/wrap-detail.svg'],
    is_featured: false,
    is_new_arrival: true,
    is_published: true,
    categorySlug: 'couple-gifts',
    daysAgo: 1,
  },
  {
    name: 'Pocket Sun Ring',
    description:
      'A tiny sun in recycled 18k gold vermeil, set with a single amber citrine. Adjustable band, presented in our velvet ring box with a polishing cloth. For the person who insists they are "not really a jewellery person".',
    price: 3400,
    discounted_price: 2890,
    stock_quantity: 2,
    images: ['/products/ring.svg', '/products/tag-detail.svg'],
    is_featured: true,
    is_new_arrival: false,
    is_published: true,
    categorySlug: 'accessories',
    daysAgo: 26,
  },
  {
    name: 'Letters To You Stationery Set',
    description:
      'A cloth-bound writing set with 24 cream sheets, twelve hand-lined envelopes and a brass-nib pen. Personalise the cover with a name or a date — we letterpress it in the shop before packing.',
    price: 1450,
    discounted_price: null,
    stock_quantity: 11,
    images: ['/products/stationery.svg', '/products/tag-detail.svg'],
    is_featured: false,
    is_new_arrival: true,
    is_published: true,
    categorySlug: 'personalized-gifts',
    daysAgo: 4,
  },
  {
    name: 'Dried Marigold Bouquet',
    description:
      'Sun-dried marigolds, wheat and bunny tails gathered by hand and tied with silk ribbon. No water, no upkeep, just a small forever summer. Around 42cm tall and arranged in our studio.',
    price: 1650,
    discounted_price: null,
    stock_quantity: 0,
    images: ['/products/bouquet.svg', '/products/wrap-detail.svg'],
    is_featured: true,
    is_new_arrival: false,
    is_published: true,
    categorySlug: 'decorative-gifts',
    daysAgo: 31,
  },
  {
    name: 'After Hours Eau de Parfum',
    description:
      'A warm, slightly mischievous fragrance: bitter orange at the top, fig and jasmine in the middle, cedar and vanilla at the base. 30ml of small-batch perfume, blended in Jaipur, in a heavy amber glass bottle.',
    price: 2750,
    discounted_price: 2350,
    stock_quantity: 6,
    images: ['/products/perfume.svg', '/products/tag-detail.svg'],
    is_featured: true,
    is_new_arrival: true,
    is_published: true,
    categorySlug: 'accessories',
    daysAgo: 3,
  },
  {
    name: 'The Little Birthday Hamper',
    description:
      'A basket of small good things: a mini candle, chocolate mendiants, a balloon kit, a handwritten card and one mystery gift. Wrapped in cellophane and ribbon, ready to walk straight into a party.',
    price: 2980,
    discounted_price: 2590,
    stock_quantity: 4,
    images: ['/products/hamper.svg', '/products/wrap-detail.svg', '/products/tag-detail.svg'],
    is_featured: true,
    is_new_arrival: false,
    is_published: true,
    categorySlug: 'birthday-gifts',
    daysAgo: 12,
  },
  {
    name: 'Nine Little Chocolates',
    description:
      'Nine hand-finished chocolates from a small Bengaluru kitchen — burnt honey, sea salt caramel, pistachio and one surprise flavour that changes every month. Palm-sized, dangerously shareable.',
    price: 980,
    discounted_price: null,
    stock_quantity: 16,
    images: ['/products/chocolates.svg', '/products/tag-detail.svg'],
    is_featured: false,
    is_new_arrival: true,
    is_published: true,
    categorySlug: 'cute-gifts',
    daysAgo: 6,
  },
  {
    name: 'Balloon Weather Kit',
    description:
      'Twelve oversized matte balloons, a reel of cotton string and a small brass pump. The colours are chosen to look good together on a ceiling; the kit is chosen to make an ordinary room feel like a party in seven minutes.',
    price: 780,
    discounted_price: null,
    stock_quantity: 9,
    images: ['/products/balloons.svg', '/products/wrap-detail.svg'],
    is_featured: false,
    is_new_arrival: false,
    is_published: true,
    categorySlug: 'birthday-gifts',
    daysAgo: 22,
  },
  {
    name: 'The Arch Frame',
    description:
      'A solid mango-wood arch frame with hand-painted matting, made for a 4×6 photo. Set one of your favourite pictures inside it, or bring a photo to the shop and we will print and frame it while you wait.',
    price: 1550,
    discounted_price: 1290,
    stock_quantity: 7,
    images: ['/products/frame.svg', '/products/tag-detail.svg'],
    is_featured: false,
    is_new_arrival: false,
    is_published: true,
    categorySlug: 'personalized-gifts',
    daysAgo: 40,
  },
  {
    name: 'Canvas Everything Tote',
    description:
      'Heavyweight cream canvas with a hand-screen-printed amber sun and a pocket that actually fits a phone. Roomy enough for a laptop, a paperback and a bunch of marigolds.',
    price: 1290,
    discounted_price: null,
    stock_quantity: 13,
    images: ['/products/tote.svg', '/products/wrap-detail.svg'],
    is_featured: false,
    is_new_arrival: false,
    is_published: true,
    categorySlug: 'accessories',
    daysAgo: 35,
  },
  {
    name: 'Good Things Jar',
    description:
      'A glass jar of tiny folded promises — 52 of them, one for every week of the year. Some are silly, some are sweets-related, one says "call your grandmother". A gift that keeps unspooling.',
    price: 950,
    discounted_price: null,
    stock_quantity: 0,
    images: ['/products/jar.svg', '/products/tag-detail.svg'],
    is_featured: false,
    is_new_arrival: true,
    is_published: true,
    categorySlug: 'other',
    daysAgo: 9,
  },
]

export function seedProducts(categories: Category[]) {
  const bySlug = new Map(categories.map((c) => [c.slug, c]))
  return SEED_PRODUCTS.map((p) => {
    const { categorySlug, daysAgo, ...rest } = p
    const category = bySlug.get(categorySlug)
    return {
      ...rest,
      category_id: category?.id ?? categories[0].id,
      created_at: new Date(Date.now() - daysAgo * 86_400_000).toISOString(),
    }
  })
}

export const detailImage = detail
