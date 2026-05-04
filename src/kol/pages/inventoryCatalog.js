const FALLBACK_CATEGORY = "Uncategorized";
const SORT_STEP = 10;
const MAX_SORT = Number.MAX_SAFE_INTEGER;

function cleanText(value) {
  return String(value || "").trim();
}

function sortValue(item) {
  const parsed = Number(item?.sort_order);
  return Number.isFinite(parsed) ? parsed : MAX_SORT;
}

function alphaCompare(left, right) {
  return cleanText(left).localeCompare(cleanText(right), undefined, { sensitivity: "base" });
}

export function getInventoryCategoryName(item) {
  return cleanText(item?.category) || FALLBACK_CATEGORY;
}

export function getInventorySubcategoryName(item) {
  return cleanText(item?.subcategory);
}

function buildRankMaps(items = []) {
  const categoryRanks = new Map();
  const subcategoryRanks = new Map();

  (items || []).forEach((item) => {
    const category = getInventoryCategoryName(item);
    const subcategory = getInventorySubcategoryName(item);
    const rank = sortValue(item);
    const subcategoryKey = `${category}\u0000${subcategory}`;

    if (!categoryRanks.has(category) || rank < categoryRanks.get(category)) {
      categoryRanks.set(category, rank);
    }
    if (!subcategoryRanks.has(subcategoryKey) || rank < subcategoryRanks.get(subcategoryKey)) {
      subcategoryRanks.set(subcategoryKey, rank);
    }
  });

  return { categoryRanks, subcategoryRanks };
}

export function getInventoryCategoryOrder(items = []) {
  const { categoryRanks } = buildRankMaps(items);
  return Array.from(categoryRanks.keys()).sort((left, right) => {
    const rankDelta = (categoryRanks.get(left) ?? MAX_SORT) - (categoryRanks.get(right) ?? MAX_SORT);
    return rankDelta || alphaCompare(left, right);
  });
}

export function buildInventoryCatalogGroups(items = [], search = "") {
  const query = cleanText(search).toLowerCase();
  const { categoryRanks, subcategoryRanks } = buildRankMaps(items);
  const grouped = new Map();

  (items || []).forEach((item) => {
    if (query) {
      const haystack = [
        item?.item_name,
        item?.category,
        item?.subcategory,
        item?.vendor,
        item?.size,
        item?.gl_account,
      ].map((value) => String(value || "").toLowerCase()).join(" ");
      if (!haystack.includes(query)) return;
    }

    const category = getInventoryCategoryName(item);
    const subcategory = getInventorySubcategoryName(item);
    if (!grouped.has(category)) grouped.set(category, new Map());
    const subgroups = grouped.get(category);
    if (!subgroups.has(subcategory)) subgroups.set(subcategory, []);
    subgroups.get(subcategory).push(item);
  });

  return Array.from(grouped.entries())
    .sort(([left], [right]) => {
      const rankDelta = (categoryRanks.get(left) ?? MAX_SORT) - (categoryRanks.get(right) ?? MAX_SORT);
      return rankDelta || alphaCompare(left, right);
    })
    .map(([category, subs]) => ({
      category,
      subcategories: Array.from(subs.entries())
        .sort(([left], [right]) => {
          const leftRank = subcategoryRanks.get(`${category}\u0000${left}`) ?? MAX_SORT;
          const rightRank = subcategoryRanks.get(`${category}\u0000${right}`) ?? MAX_SORT;
          return (leftRank - rightRank) || alphaCompare(left, right);
        })
        .map(([name, subItems]) => ({
          name,
          items: [...subItems].sort((left, right) => (
            (sortValue(left) - sortValue(right)) || alphaCompare(left?.item_name, right?.item_name)
          )),
        })),
    }));
}

export function assignInventoryCatalogSortOrder(items = [], categoryOrderOverride = null) {
  const categories = categoryOrderOverride || getInventoryCategoryOrder(items);
  const categorySet = new Set(categories);
  const missingCategories = getInventoryCategoryOrder(items).filter((category) => !categorySet.has(category));
  const orderedCategories = [...categories, ...missingCategories];
  const grouped = buildInventoryCatalogGroups(items, "");
  const groupedByCategory = new Map(grouped.map((group) => [group.category, group]));
  const flattened = [];

  orderedCategories.forEach((category) => {
    const group = groupedByCategory.get(category);
    if (!group) return;
    group.subcategories.forEach((sub) => {
      sub.items.forEach((item) => flattened.push(item));
    });
  });

  return flattened.map((item, index) => ({
    ...item,
    sort_order: (index + 1) * SORT_STEP,
  }));
}

export function moveInventoryCategory(items = [], category, direction) {
  const order = getInventoryCategoryOrder(items);
  const fromIndex = order.indexOf(category);
  const toIndex = fromIndex + direction;
  if (fromIndex < 0 || toIndex < 0 || toIndex >= order.length) {
    return assignInventoryCatalogSortOrder(items);
  }

  const nextOrder = [...order];
  const [moved] = nextOrder.splice(fromIndex, 1);
  nextOrder.splice(toIndex, 0, moved);
  return assignInventoryCatalogSortOrder(items, nextOrder);
}

export function inventorySectionId(category) {
  const safe = cleanText(category).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `inventory-category-${safe || "uncategorized"}`;
}
