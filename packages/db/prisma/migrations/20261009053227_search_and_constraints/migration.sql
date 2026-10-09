-- Extensions -----------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Data-integrity constraints Prisma cannot express ---------------------------
ALTER TABLE "Inventory" ADD CONSTRAINT "inventory_quantity_nonneg" CHECK ("quantity" >= 0);
ALTER TABLE "Inventory" ADD CONSTRAINT "inventory_reserved_nonneg" CHECK ("reserved" >= 0);
ALTER TABLE "Inventory" ADD CONSTRAINT "inventory_reserved_lte_quantity" CHECK ("reserved" <= "quantity");
ALTER TABLE "ProductVariant" ADD CONSTRAINT "variant_price_valid" CHECK ("price" >= 0 AND "price" <= "mrp");
ALTER TABLE "Review" ADD CONSTRAINT "review_rating_range" CHECK ("rating" BETWEEN 1 AND 5);
ALTER TABLE "CartItem" ADD CONSTRAINT "cartitem_quantity_positive" CHECK ("quantity" > 0);

-- Full-text search vector ------------------------------------------------------
-- Weighted: name (A) > brand/category/tags (B) > highlights (C) > description (D)
CREATE OR REPLACE FUNCTION product_search_vector_update() RETURNS trigger AS $$
DECLARE
  brand_name text;
  category_name text;
BEGIN
  SELECT b."name" INTO brand_name FROM "Brand" b WHERE b."id" = NEW."brandId";
  SELECT c."name" INTO category_name FROM "Category" c WHERE c."id" = NEW."categoryId";
  NEW."searchVector" :=
    setweight(to_tsvector('english', coalesce(NEW."name", '')), 'A') ||
    setweight(to_tsvector('english', coalesce(brand_name, '') || ' ' || coalesce(category_name, '') || ' ' ||
              coalesce(array_to_string(NEW."tags", ' '), '')), 'B') ||
    setweight(to_tsvector('english', coalesce(array_to_string(NEW."highlights", ' '), '')), 'C') ||
    setweight(to_tsvector('english', coalesce(NEW."description", '')), 'D');
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

CREATE TRIGGER product_search_vector_trigger
  BEFORE INSERT OR UPDATE OF "name", "tags", "highlights", "description", "brandId", "categoryId"
  ON "Product"
  FOR EACH ROW EXECUTE FUNCTION product_search_vector_update();

-- Indexes (declared in schema.prisma so Prisma does not report drift) ----------
-- CreateIndex
CREATE INDEX "Brand_name_trgm_idx" ON "Brand" USING GIN ("name" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Category_name_trgm_idx" ON "Category" USING GIN ("name" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Product_searchVector_idx" ON "Product" USING GIN ("searchVector");

-- CreateIndex
CREATE INDEX "Product_name_trgm_idx" ON "Product" USING GIN ("name" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "ProductVariant_attributes_idx" ON "ProductVariant" USING GIN ("attributes" jsonb_path_ops);
