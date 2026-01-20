# Dictionary Feature Implementation Plan

## Overview

Replace the existing `glossaries` feature with a new normalized `dictionary` structure. The dictionary stores multilingual term translations for each project.

## Requirements Summary

| Requirement | Decision |
|-------------|----------|
| Replaces glossaries | Yes - drop glossaries table |
| Migration | Start fresh - no data migration |
| Scope | Per-project only (entity_id + project_id) |
| Search type | Case-insensitive exact match |
| POST behavior | Upsert - update existing if same text found |
| PUT behavior | Partial update - keep languages not in payload |

---

## Database Schema

### Table: `dictionary`

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | UUID | PRIMARY KEY, DEFAULT random |
| `entity_id` | UUID | NOT NULL, FK -> entities.id ON DELETE CASCADE |
| `project_id` | UUID | NOT NULL, FK -> projects.id ON DELETE CASCADE |
| `created_at` | TIMESTAMP | DEFAULT NOW() |
| `updated_at` | TIMESTAMP | DEFAULT NOW() |

**Indexes:**
- `whisperly_dictionary_project_idx` on `(project_id)`
- `whisperly_dictionary_entity_idx` on `(entity_id)`

### Table: `dictionary_entry`

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | UUID | PRIMARY KEY, DEFAULT random |
| `dictionary_id` | UUID | NOT NULL, FK -> dictionary.id ON DELETE CASCADE |
| `language_code` | VARCHAR(10) | NOT NULL |
| `text` | TEXT | NOT NULL |
| `created_at` | TIMESTAMP | DEFAULT NOW() |
| `updated_at` | TIMESTAMP | DEFAULT NOW() |

**Indexes:**
- `whisperly_dict_entry_dict_idx` on `(dictionary_id)`
- `whisperly_dict_entry_search_idx` on `(dictionary_id, language_code, LOWER(text))` for case-insensitive search
- UNIQUE constraint on `(dictionary_id, language_code)` - one entry per language per dictionary

---

## API Endpoints

### 1. Search Dictionary

```
GET /entities/:entitySlug/projects/:projectId/dictionary/search/:language_code/:text
```

**Logic:**
1. Resolve entitySlug to entity_id
2. Find dictionary_entry where:
   - dictionary.entity_id = entity_id
   - dictionary.project_id = projectId
   - dictionary_entry.language_code = language_code
   - LOWER(dictionary_entry.text) = LOWER(text)
3. Get dictionary_id from matched entry
4. Fetch all entries for that dictionary_id
5. Return `{ language_code: text }` map

**Response:** `200 OK` with `{ data: { "en": "hello", "es": "hola", ... } }`
**Error:** `404 Not Found` if no match

### 2. Create Dictionary

```
POST /entities/:entitySlug/projects/:projectId/dictionary
```

**Payload:** `{ "en": "hello", "es": "hola", "fr": "bonjour" }`

**Logic (Upsert):**
1. For each language_code in payload, search for existing entry (case-insensitive)
2. If ANY entry matches: update that dictionary with all languages from payload
3. If NO match: create new dictionary + all entries

**Response:** `201 Created` or `200 OK` with the dictionary entries

### 3. Update Dictionary

```
PUT /entities/:entitySlug/projects/:projectId/dictionary/:dictionaryId
```

**Payload:** `{ "en": "hi", "de": "hallo" }`

**Logic (Partial Update):**
1. Verify dictionary belongs to entity/project
2. For each language in payload:
   - If entry exists for language: UPDATE text
   - If entry doesn't exist: INSERT new entry
3. Keep existing entries for languages NOT in payload

**Response:** `200 OK` with updated dictionary entries

### 4. Delete Dictionary

```
DELETE /entities/:entitySlug/projects/:projectId/dictionary/:dictionaryId
```

**Logic:**
1. Verify dictionary belongs to entity/project
2. Delete dictionary row (CASCADE deletes all entries)

**Response:** `200 OK` with deleted dictionary data

---

## Files to Modify

### 1. Database Schema
**File:** `src/db/schema.ts`

- Remove: `glossaries` table definition
- Add: `dictionary` table definition
- Add: `dictionaryEntry` table definition

### 2. Database Index (migration)
**File:** `drizzle/` (new migration)

- Drop `glossaries` table
- Create `dictionary` table
- Create `dictionary_entry` table with indexes

### 3. Zod Schemas
**File:** `src/schemas/index.ts`

- Remove: glossary schemas
- Add: `dictionaryCreateSchema` - `z.record(z.string(), z.string())`
- Add: `dictionaryUpdateSchema` - `z.record(z.string(), z.string())`
- Add: `dictionarySearchParamSchema` - entitySlug, projectId, language_code, text
- Add: `dictionaryIdParamSchema` - entitySlug, projectId, dictionaryId

### 4. Routes
**File:** `src/routes/dictionary.ts` (new file)

- GET `/search/:language_code/:text`
- POST `/`
- PUT `/:dictionaryId`
- DELETE `/:dictionaryId`

**File:** `src/routes/index.ts`

- Remove: glossariesRouter import and route
- Add: dictionaryRouter import
- Add: route `/entities/:entitySlug/projects/:projectId/dictionary`

### 5. Remove Glossaries
**Files to delete:**
- `src/routes/glossaries.ts`

---

## Types to Update

### whisperly_types package

**Remove:**
- `Glossary`
- `GlossaryCreateRequest`
- `GlossaryUpdateRequest`
- `GlossaryQueryParams`
- `GlossaryListResponse`
- `GlossaryResponse`
- `GlossaryLookupRequest`
- `GlossaryLookupResponse`
- `GlossaryLookupApiResponse`

**Add:**
```typescript
export interface Dictionary {
  id: string;
  entity_id: string;
  project_id: string;
  created_at: Date | null;
  updated_at: Date | null;
}

export interface DictionaryEntry {
  id: string;
  dictionary_id: string;
  language_code: string;
  text: string;
  created_at: Date | null;
  updated_at: Date | null;
}

// API response: flattened to { language_code: text }
export type DictionaryTranslations = Record<string, string>;

export interface DictionaryCreateRequest {
  translations: DictionaryTranslations; // { "en": "hello", "es": "hola" }
}

export interface DictionaryUpdateRequest {
  translations: DictionaryTranslations;
}

export interface DictionarySearchResponse {
  dictionary_id: string;
  translations: DictionaryTranslations;
}
```

### whisperly_client package

- Remove glossary-related hooks and client methods
- Add dictionary hooks and client methods

---

## Implementation Order

1. **whisperly_types** - Add new types, remove glossary types
2. **whisperly_api/schema** - Add dictionary tables, remove glossaries
3. **whisperly_api/schemas** - Add Zod validation schemas
4. **whisperly_api/routes** - Create dictionary router, remove glossaries router
5. **whisperly_api/routes/index** - Update route registration
6. **whisperly_client** - Update client methods and hooks
7. **Run migrations** - `bun run db:generate && bun run db:push`
8. **Tests** - Add dictionary route tests

---

## Verification

1. Run `bun run typecheck` in whisperly_types, whisperly_api, whisperly_client
2. Run `bun run lint` in all packages
3. Run `bun run test:run` in all packages
4. Run `bun run db:push` to apply schema changes
5. Test endpoints manually:
   - POST a dictionary entry
   - GET search for it
   - PUT to update it
   - DELETE to remove it
