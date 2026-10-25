-- Categories can be retired without deleting them, so members' existing skill
-- entries keep working while the category disappears from new-entry pickers.
ALTER TABLE "SkillCategory" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX "SkillCategory_isActive_sortOrder_idx" ON "SkillCategory"("isActive", "sortOrder");
