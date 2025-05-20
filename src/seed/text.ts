import type { Rng } from './random.js';

// Marketplace copy varies a lot: most listings have a few paragraphs, and many
// sellers paste their whole listing template (care, shipping, returns, FAQ),
// which puts a large share of descriptions in the 2-6 KB range.

const OPENERS = [
  'Meet the {name}, made in small batches by the team at {store}.',
  'The {name} is one of our best-loved pieces and a customer favourite since we opened.',
  'Our {name} brings a little of the island into your home.',
  'Designed in our workshop and finished by hand, the {name} is built to be used every day.',
  'We made the {name} because we could not find one we liked in the shops.',
  'Every {name} is a little different, which is exactly the point.',
  'The {name} started as a one-off for a friend and became our most requested item.',
];

const BODY = [
  'We work with {material} sourced from family-run suppliers we have known for years, and we pay them fairly and on time.',
  'Each piece takes between two and five days to make, depending on the weather and how fast the {material} dries.',
  'Colours may vary slightly from the photos because every batch is dyed by hand in natural light.',
  'It is finished with a food-safe oil and buffed by hand, so expect small marks that show it was made by a person and not a machine.',
  'The {colour} tone pairs well with natural wood, linen and plenty of plants.',
  'We tested the {name} for six months in our own homes before listing it, and changed the design twice.',
  'Our makers are paid per piece at well above the local average, and every purchase supports their families directly.',
  'If you are buying this as a gift, add a note at checkout and we will hand-write a card and wrap it in recycled paper.',
  'Small irregularities in the weave, glaze or grain are part of the charm and are not defects.',
  'We keep a small stock and make more every week, so if it is sold out please add it to your wishlist and check back soon.',
  'This design is inspired by the patterns on old temple walls and the colours of the {colour} sky after the monsoon.',
  'It packs flat and travels well, which is why so many customers buy a second one to take back home.',
  'We use plastic-free packaging wherever we can: paper tape, recycled cardboard and shredded paper instead of bubble wrap.',
  'The {material} softens and develops a lovely patina with use, so it will look better in a year than it does today.',
  'Sizes are measured by hand and can vary by up to one centimetre either way.',
  'Customers tell us it is the piece visitors always ask about, and we never get tired of hearing that.',
];

const CARE = [
  'Care: wipe clean with a damp cloth and dry immediately. Do not soak.',
  'Care: hand wash in cold water with a mild soap and dry flat in the shade.',
  'Care: machine wash on a gentle cycle at 30 degrees, inside out. Do not tumble dry.',
  'Care: keep out of direct sunlight to protect the natural dyes.',
  'Care: oil lightly once a month with coconut or mineral oil to keep the {material} from drying out.',
  'Care: not suitable for the dishwasher or microwave.',
];

const SHIPPING = [
  'Shipping: orders placed before 2pm (Colombo time) ship the next working day. Island-wide delivery takes 2-4 working days; international orders usually arrive in 7-14 days.',
  'Shipping: we ship worldwide with tracking. Customs duties for international orders are paid by the buyer on delivery.',
  'Free shipping on orders over $50. Orders below that ship for a flat $5.99.',
];

const RETURNS = [
  'Returns: if you are not happy, send it back unused within 30 days for a full refund. Personalised items cannot be returned.',
  'Returns: we accept returns within 14 days of delivery. Please contact us first so we can arrange the courier.',
  'Something arrived damaged? Send us a photo within 7 days and we will replace it free of charge.',
];

const FAQ = [
  'Q: Is it suitable as a gift? A: Yes, and we offer free gift wrapping on request.',
  'Q: Can I order in bulk for an event or a shop? A: Yes, message us through the store page for trade prices.',
  'Q: Is the {material} sustainably sourced? A: Yes, we buy only from suppliers we have visited.',
  'Q: Will the colour fade? A: Natural dyes soften gently over time; keep it out of strong sun to slow this down.',
  'Q: Do you make custom sizes? A: Sometimes. Ask us and we will tell you honestly whether we can do it.',
  'Q: How long will it last? A: With basic care, many years. We still use our very first prototype.',
];

function fill(template: string, vars: Record<string, string>) {
  return template.replace(/\{(\w+)\}/g, (_m, key: string) => vars[key] ?? '');
}

export function productDescription(rng: Rng, vars: { name: string; store: string; material: string; colour: string }) {
  const target = rng.chance(0.25) ? rng.int(2_000, 6_000) : rng.int(400, 1_500);
  const template = target >= 2_000;
  const parts: string[] = [fill(rng.pick(OPENERS), vars)];
  let length = parts[0].length;
  const pools = [BODY, BODY, BODY, CARE, FAQ, BODY, FAQ];
  while (length < target - (template ? 400 : 150)) {
    const sentences: string[] = [];
    const count = rng.int(3, 6);
    const pool = rng.pick(pools);
    for (let i = 0; i < count; i++) sentences.push(fill(rng.pick(pool), vars));
    const paragraph = sentences.join(' ');
    parts.push(paragraph);
    length += paragraph.length + 2;
  }
  if (template) {
    parts.push(fill(rng.pick(CARE), vars));
    parts.push(rng.pick(SHIPPING));
    parts.push(rng.pick(RETURNS));
  }
  return parts.join('\n\n');
}

const STORE_LINES = [
  'We are a small team of makers based in {city}, selling directly to you without a middleman.',
  'Started at a kitchen table in {year}, we now work with more than {makers} artisans across the island.',
  'Everything we sell is designed in-house and made by hand.',
  'We ship from {city} every weekday and answer messages within a day.',
  'Follow our store to hear about new collections first.',
];

export function storeDescription(rng: Rng, city: string) {
  const vars = { city, year: String(rng.int(2012, 2023)), makers: String(rng.int(5, 120)) };
  return rng
    .shuffle([...STORE_LINES])
    .slice(0, rng.int(2, 4))
    .map((l) => fill(l, vars))
    .join(' ');
}

const REVIEW_TITLES: Record<number, string[]> = {
  5: ['Absolutely love it', 'Perfect', 'Beautiful quality', 'Exceeded expectations', 'Gorgeous', 'Lovely gift', 'Five stars', 'Will buy again'],
  4: ['Really nice', 'Very good', 'Happy with it', 'Good value', 'Nice quality', 'Pretty much as described'],
  3: ['It is okay', 'Decent', 'Mixed feelings', 'Average', 'Fine for the price'],
  2: ['Disappointed', 'Not as pictured', 'Smaller than expected', 'Took ages to arrive'],
  1: ['Very poor', 'Arrived broken', 'Would not recommend', 'Not worth it'],
};

const REVIEW_SENTENCES: Record<number, string[]> = {
  5: [
    'Arrived quickly and looks exactly like the photos.',
    'The quality is far better than I expected for the price.',
    'I bought one for myself and ended up ordering two more as gifts.',
    'You can tell it was made with care.',
    'The packaging was lovely and completely plastic free.',
    'My whole family loves it.',
    'The colour is even nicer in person.',
    'The seller added a handwritten note, which was a sweet touch.',
  ],
  4: [
    'Good quality overall, just a little smaller than I imagined.',
    'Delivery took a few extra days but it was worth the wait.',
    'Nice piece, the finish has a couple of small marks but nothing major.',
    'Happy with the purchase and would order from this shop again.',
    'Looks great in our living room.',
  ],
  3: [
    'It does the job but the finish could be better.',
    'The colour is a bit different from the photos.',
    'Decent for the price, nothing special.',
    'Shipping was slow and the box was a bit battered.',
  ],
  2: [
    'Smaller than the listing suggests.',
    'The stitching came loose after a couple of weeks.',
    'It took almost three weeks to arrive.',
    'Not quite what I expected from the pictures.',
  ],
  1: [
    'It arrived broken and I am still waiting for a reply.',
    'The quality is really poor.',
    'Nothing like the photos.',
    'I asked for a refund.',
  ],
};

// Reviews that trip the moderation filter and were held for an admin.
const HELD_SENTENCES = [
  'Message me on whatsapp for a better price on bulk orders.',
  'Contact me if you want the same thing cheaper.',
  'I can sell you a gift card for half price, inbox me.',
  'Pay by bank transfer and I will throw in a second one.',
];

export function reviewText(rng: Rng, rating: number, held: boolean) {
  const title = rng.pick(REVIEW_TITLES[rating]);
  const sentences: string[] = [];
  const count = rng.int(1, 6);
  for (let i = 0; i < count; i++) sentences.push(rng.pick(REVIEW_SENTENCES[rating]));
  if (held) sentences.splice(rng.int(0, sentences.length), 0, rng.pick(HELD_SENTENCES));
  return { title, body: sentences.join(' ') };
}

export const ALL_REVIEW_SENTENCES = [...Object.values(REVIEW_SENTENCES).flat(), ...Object.values(REVIEW_TITLES).flat()];
export const ALL_HELD_SENTENCES = HELD_SENTENCES;
