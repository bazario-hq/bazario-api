// Category tree and product vocabulary for generated catalogue data.

export interface LeafDef {
  name: string;
  nouns: string[];
}
export interface SubDef {
  name: string;
  leaves: LeafDef[];
}
export interface TopDef {
  name: string;
  materials: string[];
  subs: SubDef[];
}

const leaf = (name: string, ...nouns: string[]): LeafDef => ({ name, nouns });

export const CATEGORY_TREE: TopDef[] = [
  {
    name: 'Home & Living',
    materials: ['Cotton', 'Linen', 'Jute', 'Rattan', 'Teak', 'Ceramic', 'Batik', 'Handloom', 'Wool', 'Bamboo'],
    subs: [
      {
        name: 'Textiles',
        leaves: [
          leaf('Cushions', 'Cushion Cover', 'Floor Cushion', 'Bolster Cover', 'Cushion Set'),
          leaf('Throws & Blankets', 'Throw', 'Blanket', 'Quilt', 'Bedspread'),
          leaf('Table Linen', 'Table Runner', 'Tablecloth', 'Napkin Set', 'Placemat Set'),
          leaf('Curtains', 'Curtain Panel', 'Sheer Curtain', 'Blackout Curtain'),
        ],
      },
      {
        name: 'Decor',
        leaves: [
          leaf('Wall Art', 'Wall Hanging', 'Framed Print', 'Tapestry', 'Canvas Print'),
          leaf('Vases & Planters', 'Vase', 'Planter', 'Bud Vase', 'Hanging Planter'),
          leaf('Candles & Holders', 'Scented Candle', 'Candle Holder', 'Tea Light Set', 'Lantern'),
          leaf('Mirrors', 'Wall Mirror', 'Round Mirror', 'Vanity Mirror'),
        ],
      },
      {
        name: 'Furniture',
        leaves: [
          leaf('Chairs & Stools', 'Accent Chair', 'Bar Stool', 'Footstool', 'Lounge Chair'),
          leaf('Tables', 'Side Table', 'Coffee Table', 'Nesting Tables', 'Console Table'),
          leaf('Storage', 'Storage Basket', 'Bookshelf', 'Chest', 'Shoe Rack'),
        ],
      },
      {
        name: 'Lighting',
        leaves: [
          leaf('Lamps', 'Table Lamp', 'Floor Lamp', 'Desk Lamp', 'Lamp Shade'),
          leaf('Pendant Lights', 'Pendant Light', 'Woven Pendant', 'Ceiling Shade'),
        ],
      },
    ],
  },
  {
    name: 'Kitchen & Dining',
    materials: ['Clay', 'Coconut Shell', 'Teak', 'Brass', 'Stainless Steel', 'Cast Iron', 'Stoneware', 'Glass', 'Bamboo'],
    subs: [
      {
        name: 'Cookware',
        leaves: [
          leaf('Pots & Pans', 'Curry Pot', 'Frying Pan', 'Saucepan', 'Wok', 'Dutch Oven'),
          leaf('Bakeware', 'Baking Tray', 'Loaf Tin', 'Cake Tin', 'Pie Dish'),
          leaf('Kitchen Tools', 'Spoon Set', 'Spatula', 'Mortar and Pestle', 'Chopping Board', 'Grater'),
        ],
      },
      {
        name: 'Tableware',
        leaves: [
          leaf('Plates & Bowls', 'Dinner Plate Set', 'Serving Bowl', 'Salad Bowl', 'Rice Bowl Set'),
          leaf('Cups & Mugs', 'Mug', 'Tea Cup Set', 'Espresso Cup Set', 'Travel Mug'),
          leaf('Cutlery', 'Cutlery Set', 'Serving Spoons', 'Chopsticks Set'),
        ],
      },
      {
        name: 'Tea & Coffee',
        leaves: [
          leaf('Teapots', 'Teapot', 'Tea Kettle', 'Tea Infuser'),
          leaf('Coffee Makers', 'Pour Over Set', 'French Press', 'Moka Pot', 'Coffee Grinder'),
        ],
      },
      {
        name: 'Storage & Organisation',
        leaves: [
          leaf('Jars & Canisters', 'Storage Jar', 'Spice Jar Set', 'Canister Set'),
          leaf('Lunch Boxes', 'Lunch Box', 'Tiffin Carrier', 'Bento Box'),
        ],
      },
    ],
  },
  {
    name: 'Fashion',
    materials: ['Cotton', 'Linen', 'Silk', 'Batik', 'Denim', 'Leather', 'Wool', 'Organic Cotton'],
    subs: [
      {
        name: 'Women',
        leaves: [
          leaf('Dresses', 'Wrap Dress', 'Maxi Dress', 'Shirt Dress', 'Sundress'),
          leaf('Tops', 'Blouse', 'Kurta Top', 'Tunic', 'Camisole'),
          leaf('Sarees', 'Saree', 'Handloom Saree', 'Batik Saree'),
        ],
      },
      {
        name: 'Men',
        leaves: [
          leaf('Shirts', 'Shirt', 'Batik Shirt', 'Linen Shirt', 'Polo Shirt'),
          leaf('Sarongs & Trousers', 'Sarong', 'Chinos', 'Drawstring Trousers'),
          leaf('Outerwear', 'Jacket', 'Overshirt', 'Rain Jacket'),
        ],
      },
      {
        name: 'Bags',
        leaves: [
          leaf('Totes', 'Tote Bag', 'Market Bag', 'Beach Bag'),
          leaf('Backpacks', 'Backpack', 'Laptop Backpack', 'Rolltop Backpack'),
          leaf('Wallets', 'Wallet', 'Card Holder', 'Coin Purse'),
        ],
      },
      {
        name: 'Shoes',
        leaves: [
          leaf('Sandals', 'Sandals', 'Slides', 'Flip Flops'),
          leaf('Sneakers', 'Canvas Sneakers', 'Running Shoes', 'Slip-ons'),
        ],
      },
    ],
  },
  {
    name: 'Jewellery & Accessories',
    materials: ['Silver', 'Brass', 'Gold Plated', 'Moonstone', 'Sapphire', 'Pearl', 'Copper', 'Wooden'],
    subs: [
      {
        name: 'Jewellery',
        leaves: [
          leaf('Necklaces', 'Necklace', 'Pendant', 'Choker', 'Chain'),
          leaf('Earrings', 'Stud Earrings', 'Hoop Earrings', 'Drop Earrings'),
          leaf('Rings', 'Ring', 'Stacking Ring Set', 'Signet Ring'),
          leaf('Bracelets', 'Bracelet', 'Bangle Set', 'Anklet'),
        ],
      },
      {
        name: 'Accessories',
        leaves: [
          leaf('Scarves', 'Scarf', 'Shawl', 'Bandana'),
          leaf('Hats', 'Sun Hat', 'Bucket Hat', 'Beanie'),
          leaf('Sunglasses', 'Sunglasses', 'Glasses Case'),
        ],
      },
      {
        name: 'Watches',
        leaves: [leaf('Wrist Watches', 'Watch', 'Wooden Watch', 'Watch Strap')],
      },
    ],
  },
  {
    name: 'Beauty & Wellness',
    materials: ['Coconut', 'Aloe Vera', 'Sandalwood', 'Turmeric', 'Cinnamon', 'Lavender', 'Neem', 'Shea'],
    subs: [
      {
        name: 'Skincare',
        leaves: [
          leaf('Soaps', 'Soap Bar', 'Soap Gift Set', 'Liquid Soap'),
          leaf('Face Care', 'Face Oil', 'Face Mask', 'Moisturiser', 'Cleanser'),
          leaf('Body Care', 'Body Butter', 'Body Scrub', 'Body Lotion'),
        ],
      },
      {
        name: 'Hair Care',
        leaves: [leaf('Hair Oils', 'Hair Oil', 'Hair Serum'), leaf('Shampoo', 'Shampoo Bar', 'Conditioner Bar', 'Shampoo')],
      },
      {
        name: 'Aromatherapy',
        leaves: [
          leaf('Essential Oils', 'Essential Oil', 'Oil Blend Set', 'Roller Blend'),
          leaf('Incense', 'Incense Sticks', 'Incense Holder', 'Resin Incense'),
          leaf('Diffusers', 'Reed Diffuser', 'Oil Burner', 'Ultrasonic Diffuser'),
        ],
      },
    ],
  },
  {
    name: 'Electronics',
    materials: ['Aluminium', 'Wooden', 'Recycled Plastic', 'Leather', 'Silicone', 'Bamboo'],
    subs: [
      {
        name: 'Phone Accessories',
        leaves: [
          leaf('Phone Cases', 'Phone Case', 'Wallet Case', 'Phone Sleeve'),
          leaf('Chargers & Cables', 'Charging Cable', 'Wall Charger', 'Power Bank', 'Charging Dock'),
          leaf('Stands & Mounts', 'Phone Stand', 'Car Mount', 'Tablet Stand'),
        ],
      },
      {
        name: 'Audio',
        leaves: [
          leaf('Headphones', 'Headphones', 'Earbuds', 'Headphone Stand'),
          leaf('Speakers', 'Bluetooth Speaker', 'Bookshelf Speaker', 'Speaker Dock'),
        ],
      },
      {
        name: 'Computer Accessories',
        leaves: [
          leaf('Keyboards & Mice', 'Keyboard', 'Wireless Mouse', 'Wrist Rest'),
          leaf('Laptop Sleeves', 'Laptop Sleeve', 'Laptop Stand', 'Cable Organiser'),
        ],
      },
    ],
  },
  {
    name: 'Sports & Outdoors',
    materials: ['Cork', 'Natural Rubber', 'Canvas', 'Nylon', 'Stainless Steel', 'Cotton', 'Bamboo'],
    subs: [
      {
        name: 'Fitness',
        leaves: [
          leaf('Yoga', 'Yoga Mat', 'Yoga Block', 'Yoga Strap', 'Meditation Cushion'),
          leaf('Weights', 'Dumbbell Set', 'Kettlebell', 'Resistance Bands'),
        ],
      },
      {
        name: 'Camping & Hiking',
        leaves: [
          leaf('Tents', 'Tent', 'Hammock', 'Tarp'),
          leaf('Camp Kitchen', 'Camping Stove', 'Water Bottle', 'Camp Mug', 'Cooler Bag'),
        ],
      },
      {
        name: 'Cycling',
        leaves: [leaf('Bike Accessories', 'Bike Light Set', 'Bike Bell', 'Pannier', 'Bike Lock')],
      },
      {
        name: 'Water Sports',
        leaves: [leaf('Swim', 'Swim Goggles', 'Rash Guard', 'Beach Towel'), leaf('Surf', 'Surf Wax', 'Surfboard Bag', 'Leash')],
      },
    ],
  },
  {
    name: 'Toys & Kids',
    materials: ['Wooden', 'Organic Cotton', 'Felt', 'Recycled Plastic', 'Bamboo', 'Crochet'],
    subs: [
      {
        name: 'Toys',
        leaves: [
          leaf('Wooden Toys', 'Wooden Train', 'Stacking Toy', 'Pull Along Toy', 'Puzzle'),
          leaf('Soft Toys', 'Soft Elephant', 'Crochet Bunny', 'Plush Toy', 'Rag Doll'),
          leaf('Games', 'Board Game', 'Carrom Board', 'Card Game', 'Marble Set'),
        ],
      },
      {
        name: 'Baby',
        leaves: [
          leaf('Baby Clothing', 'Baby Romper', 'Baby Onesie Set', 'Baby Hat'),
          leaf('Nursery', 'Baby Blanket', 'Mobile', 'Changing Mat'),
        ],
      },
      {
        name: 'Kids Room',
        leaves: [leaf('Kids Decor', 'Wall Decal', 'Night Light', 'Kids Rug'), leaf('Kids Furniture', 'Kids Chair', 'Toy Box', 'Kids Table')],
      },
    ],
  },
  {
    name: 'Books & Stationery',
    materials: ['Handmade Paper', 'Leather', 'Recycled Paper', 'Brass', 'Wooden', 'Cotton Paper'],
    subs: [
      {
        name: 'Stationery',
        leaves: [
          leaf('Notebooks', 'Notebook', 'Journal', 'Sketchbook', 'Planner'),
          leaf('Pens & Pencils', 'Fountain Pen', 'Pencil Set', 'Brush Pen Set'),
          leaf('Cards & Wrap', 'Greeting Card Set', 'Gift Wrap', 'Postcard Set'),
        ],
      },
      {
        name: 'Books',
        leaves: [
          leaf('Cookbooks', 'Cookbook', 'Recipe Journal'),
          leaf('Fiction', 'Novel', 'Short Story Collection'),
          leaf('Travel Guides', 'Travel Guide', 'Phrasebook', 'Map Set'),
        ],
      },
      {
        name: 'Art Supplies',
        leaves: [leaf('Paints', 'Watercolour Set', 'Acrylic Paint Set', 'Gouache Set'), leaf('Craft Kits', 'Embroidery Kit', 'Batik Kit', 'Weaving Kit')],
      },
    ],
  },
  {
    name: 'Garden & DIY',
    materials: ['Terracotta', 'Galvanised Steel', 'Teak', 'Coir', 'Bamboo', 'Concrete'],
    subs: [
      {
        name: 'Garden',
        leaves: [
          leaf('Pots', 'Terracotta Pot', 'Self-Watering Pot', 'Window Box'),
          leaf('Garden Tools', 'Trowel', 'Pruning Shears', 'Garden Gloves', 'Watering Can'),
          leaf('Outdoor Decor', 'Wind Chime', 'Bird Feeder', 'Garden Lantern'),
        ],
      },
      {
        name: 'Tools',
        leaves: [leaf('Hand Tools', 'Screwdriver Set', 'Hammer', 'Tool Roll'), leaf('Workshop', 'Workbench Mat', 'Tool Box', 'Clamp Set')],
      },
    ],
  },
  {
    name: 'Pets',
    materials: ['Cotton', 'Jute', 'Natural Rubber', 'Leather', 'Bamboo', 'Felt'],
    subs: [
      {
        name: 'Dogs',
        leaves: [leaf('Dog Beds', 'Dog Bed', 'Dog Blanket', 'Crate Mat'), leaf('Collars & Leads', 'Dog Collar', 'Lead', 'Harness')],
      },
      {
        name: 'Cats',
        leaves: [leaf('Cat Toys', 'Cat Toy Set', 'Scratcher', 'Cat Tunnel'), leaf('Cat Beds', 'Cat Bed', 'Cat Cave', 'Window Perch')],
      },
      {
        name: 'Pet Bowls',
        leaves: [leaf('Bowls & Feeders', 'Pet Bowl', 'Slow Feeder', 'Water Fountain')],
      },
    ],
  },
  {
    name: 'Food & Drink',
    materials: ['Ceylon', 'Organic', 'Small Batch', 'Single Estate', 'Wild', 'Hand Picked'],
    subs: [
      {
        name: 'Tea',
        leaves: [
          leaf('Black Tea', 'Black Tea', 'Breakfast Blend', 'Earl Grey'),
          leaf('Green Tea', 'Green Tea', 'Jasmine Green Tea', 'Matcha'),
          leaf('Herbal Tea', 'Herbal Tea', 'Ginger Tea', 'Hibiscus Tea'),
        ],
      },
      {
        name: 'Spices',
        leaves: [leaf('Whole Spices', 'Cinnamon Quills', 'Cardamom', 'Black Pepper', 'Cloves'), leaf('Spice Blends', 'Curry Powder', 'Spice Gift Box', 'Chilli Flakes')],
      },
      {
        name: 'Pantry',
        leaves: [
          leaf('Sweets', 'Kithul Treacle', 'Coconut Toffee', 'Chocolate Bar', 'Honey'),
          leaf('Coffee', 'Coffee Beans', 'Ground Coffee', 'Coffee Gift Set'),
          leaf('Sauces & Pickles', 'Chutney', 'Lime Pickle', 'Sambol', 'Hot Sauce'),
        ],
      },
    ],
  },
];

export const ADJECTIVES = [
  'Classic', 'Rustic', 'Handmade', 'Hand-Woven', 'Minimalist', 'Vintage', 'Modern', 'Artisan', 'Natural', 'Everyday',
  'Heritage', 'Coastal', 'Tropical', 'Nordic', 'Bohemian', 'Indigo', 'Ochre', 'Terracotta', 'Sage', 'Charcoal',
  'Ivory', 'Saffron', 'Ocean', 'Monsoon', 'Lotus', 'Kandyan', 'Galle', 'Ella', 'Sigiriya', 'Lagoon',
  'Sunset', 'Forest', 'Spice Route', 'Temple', 'Island', 'Hill Country', 'Pearl', 'Cinnamon', 'Tea Garden', 'Peacock',
];

export const VARIANTS = ['', '', '', '', 'Small', 'Large', 'Set of 2', 'Set of 4', 'Set of 6', 'Mini', 'XL', 'Twin Pack', 'Gift Edition'];

export const COLOURS = [
  'indigo', 'natural', 'charcoal', 'ochre', 'sage green', 'terracotta', 'ivory', 'rust', 'teal', 'mustard',
  'blush pink', 'navy', 'forest green', 'sand', 'black', 'white', 'saffron', 'plum', 'sky blue', 'coral',
];

export const STORE_PREFIX = [
  'Ceylon', 'Lanka', 'Island', 'Lotus', 'Monsoon', 'Spice Route', 'Kandy', 'Galle', 'Colombo', 'Jaffna',
  'Ella', 'Mirissa', 'Hill Country', 'Lagoon', 'Coral', 'Tea Leaf', 'Cinnamon', 'Peacock', 'Elephant', 'Banyan',
  'Kithul', 'Batik', 'Loom', 'Clay', 'Coconut', 'Palm', 'Sapphire', 'Moonstone', 'Sunrise', 'Harbour',
];
export const STORE_SUFFIX = [
  'Crafts', 'Makers', 'Studio', 'Collective', 'Trading Co.', 'Home', 'Goods', 'Workshop', 'Atelier', 'House',
  'Market', 'Supply', 'Co.', 'Store', 'Emporium', 'Designs', 'Handmade', 'Living', 'Outfitters', 'Pantry',
];

export const FIRST_NAMES = [
  'Amaya', 'Nimal', 'Kavindi', 'Ruwan', 'Dilani', 'Tharindu', 'Sanduni', 'Chamara', 'Ishara', 'Pradeep',
  'Nadeesha', 'Kasun', 'Hiruni', 'Lahiru', 'Sachini', 'Dinesh', 'Malsha', 'Asela', 'Gayani', 'Janith',
  'Emma', 'Liam', 'Olivia', 'Noah', 'Ava', 'Lucas', 'Mia', 'Ethan', 'Sofia', 'Mason',
  'Priya', 'Arjun', 'Ananya', 'Rohan', 'Meera', 'Vikram', 'Aisha', 'Omar', 'Fatima', 'Yusuf',
  'Chen', 'Mei', 'Hiro', 'Yuki', 'Min-jun', 'Ji-woo', 'Lena', 'Felix', 'Clara', 'Jonas',
  'Isabel', 'Mateo', 'Lucia', 'Diego', 'Chloe', 'Hugo', 'Zara', 'Leo', 'Nora', 'Sam',
];
export const LAST_NAMES = [
  'Perera', 'Fernando', 'Silva', 'Jayawardena', 'Bandara', 'Wickramasinghe', 'Dissanayake', 'Gunawardena', 'Rathnayake', 'Herath',
  'Senanayake', 'Kumara', 'Wijesinghe', 'Ranasinghe', 'Mendis', 'De Silva', 'Abeysekara', 'Karunaratne', 'Liyanage', 'Peiris',
  'Smith', 'Johnson', 'Brown', 'Taylor', 'Wilson', 'Martin', 'Garcia', 'Muller', 'Rossi', 'Dubois',
  'Sharma', 'Patel', 'Iyer', 'Khan', 'Rahman', 'Tan', 'Wong', 'Kim', 'Sato', 'Nguyen',
  'Andersen', 'Novak', 'Kowalski', 'Lopez', 'Costa', 'Murphy', "O'Brien", 'Schmidt', 'Weber', 'Haddad',
];

export const CITIES: [string, string, string][] = [
  ['Colombo', 'LK', '00300'], ['Kandy', 'LK', '20000'], ['Galle', 'LK', '80000'], ['Negombo', 'LK', '11500'], ['Jaffna', 'LK', '40000'],
  ['Matara', 'LK', '81000'], ['Kurunegala', 'LK', '60000'], ['Batticaloa', 'LK', '30000'], ['Nuwara Eliya', 'LK', '22200'], ['Anuradhapura', 'LK', '50000'],
  ['London', 'GB', 'SE1 7PB'], ['Manchester', 'GB', 'M1 1AE'], ['Berlin', 'DE', '10115'], ['Munich', 'DE', '80331'], ['Paris', 'FR', '75011'],
  ['Amsterdam', 'NL', '1012 AB'], ['Melbourne', 'AU', '3000'], ['Sydney', 'AU', '2000'], ['Toronto', 'CA', 'M5V 2T6'], ['New York', 'US', '10001'],
  ['San Francisco', 'US', '94103'], ['Austin', 'US', '73301'], ['Singapore', 'SG', '018956'], ['Dubai', 'AE', '00000'], ['Chennai', 'IN', '600001'],
];

export const STREETS = [
  'Galle Road', 'Duplication Road', 'Temple Road', 'Lake Drive', 'Station Road', 'Flower Road', 'Hill Street', 'Main Street',
  'Park Avenue', 'Church Lane', 'Market Street', 'Beach Road', 'Peradeniya Road', 'High Street', 'Mill Lane', 'Harbour View',
];

export const SPEC_KEYS: Record<string, string[]> = {
  default: ['Material', 'Colour', 'Origin', 'Dimensions', 'Weight', 'Care', 'Finish', 'Maker', 'Pack size', 'Warranty'],
};

export const SEARCH_SUFFIXES = ['gift', 'set', 'handmade', 'large', 'small', 'blue', 'cotton', 'wooden', 'for kids', 'vintage'];
