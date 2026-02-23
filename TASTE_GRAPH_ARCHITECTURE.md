# Musical Taste Graph Architecture

This document provides a comprehensive analysis of how and where to store users' musical tastes, focusing on the newly created "Guest" user and the implementation of a weighted Taste Graph structure using Supabase.

## 1. What is the Taste Graph?

The Taste Graph is a structural representation of a user's musical preferences. Instead of just a flat list of top genres (e.g., `["Pop", "Rock"]`), it features:
- **Nodes:** Genres, sub-genres, and mood categories (like those in `genres.svg`).
- **Edges & Weights:** Connections between the user and these nodes, assigned a numerical weight (e.g., `0.0` to `1.0` or `1 to 100`) representing affinity.
- **Hierarchies:** An understanding that "Tech House" is a child of "Electronic", so liking "Tech House" passively increases the "Electronic" weight.

## 2. Storing the Graph in Supabase

Yes, **we absolutely can store the full graph and weights in Supabase**. Since Supabase is built on top of PostgreSQL, we have multiple highly efficient ways to store this data.

### Option A: The JSONB Approach (Recommended for V1)
PostgreSQL's `JSONB` column type is incredibly powerful. We can store the entire complex graph of weights in a single column within a `user_profiles` table.

```sql
CREATE TABLE user_profiles (
    id UUID REFERENCES auth.users(id) PRIMARY KEY,
    username TEXT,
    is_guest BOOLEAN DEFAULT FALSE,
    taste_graph JSONB DEFAULT '{}'::jsonb,  -- Stores the node weights
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Example `taste_graph` JSONB payload:**
```json
{
  "genres": {
    "Electronic": 85,
    "Rock": 40,
    "Hip-Hop": 12
  },
  "subgenres": {
    "Tech House": 90,
    "Indie Rock": 60
  },
  "moods": {
    "Energetic": 95,
    "Melancholic": 30
  },
  "history_modifiers": {
    "last_listened_bonus_applied_at": "2026-02-23T12:00:00Z"
  }
}
```

**Why Option A?**
- **Flexibility:** As we expand `genres.svg` and introduce new sub-genres, we don't need to perform complex database migrations. We just push new JSON keys.
- **Performance:** Fetching a user's entire taste profile is a single row read. JSONB allows for indexing specific keys if needed later.

### Option B: The Relational Approach (For Advanced Analytics/Social Features)
If we want to build features like "Find users with similar taste to me" or "Top trending genres globally", a relational model is better.

```sql
-- Table mapping the static nodes (Genres/Subgenres/Moods)
CREATE TABLE graph_nodes (
    id SERIAL PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    type TEXT NOT NULL, -- 'genre', 'subgenre', 'mood'
    parent_id INTEGER REFERENCES graph_nodes(id) -- Hierarchical
);

-- Table mapping the User to the Nodes with a weight
CREATE TABLE user_node_weights (
    user_id UUID REFERENCES auth.users(id),
    node_id INTEGER REFERENCES graph_nodes(id),
    weight NUMERIC(5, 2) NOT NULL DEFAULT 0.0,
    last_updated TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (user_id, node_id)
);
```

**Why Option B?**
- **Data Integrity:** Ensures no misspellings of genres.
- **Query Power:** Allows complex SQL aggregation across all users.

### Option C: pgvector (For Machine Learning / AI Discovery)
If we eventually use AI to generate embeddings representing a user's "vibe", Supabase supports `pgvector`. 
- The user's taste graph gets embedded into a 512-dimension vector.
- Supabase stores `<vector>`, allowing us to find similar users using Cosine Similarity mathematically!

---

## 3. Focus on the Guest User

We recently created the `testguest@gmail.com` user in the Supabase `auth.users` system. This means **the Guest is a first-class citizen in the database**, just like a Google OAuth user.

### How to handle the Guest Taste Graph:

1. **Local State (Fast UI):** When the guest selects moods and clicks "Discover", the UI updates the Local React State and LocalStorage (`musicMood_genres`).
2. **Syncing to Supabase (Persistence):**
   - The Guest is logged into Supabase Auth under the hood locally.
   - We create an RPC (Remote Procedure Call) or a Postgres trigger/function in Supabase called `update_taste_weight`.
   - Every time a guest completes a discovery or likes a song, the app fires an async update to Supabase to mutate their `JSONB` graph.
3. **The "Transient" Guest vs. The "Permanent" Guest:**
   - Currently, our Guest is a single shared account (`testguest@gmail.com`). This means **every guest in the world will share the same Taste Graph**!
   - This creates a "Global Wisdom of the Crowd" guest profile. 
   - **Alternative for Personalized Guests:** If we want individual guests to have their own taste graphs without Google Login, we should use Supabase's **Anonymous Sign-ins** feature. This generates a unique `UUID` for every individual device that clicks "Continue as Guest" without requiring a password.

## 4. Proposed Implementation Plan

1. **Step 1: Create `user_profiles` Table**
   - Execute SQL in Supabase to create the table linking to `auth.users` with a `JSONB` `taste_graph` column.
2. **Step 2: Anonymous Sign-Ins for Guests**
   - Refactor the "Continue as Guest" button to use `supabase.auth.signInAnonymously()`. This prevents all guests from overwriting the single `testguest` account's tastes.
3. **Step 3: Graph Mutation Logic (`src/services/tasteEngine.js`)**
   - Build a utility that takes a "Played Track" or "Selected Mood" and figures out which nodes to increase.
   - Example: Listening to "Radiohead" -> Nodes: `[Rock: +2, Alternative: +5, Melancholic: +3]`.
4. **Step 4: Sync**
   - Provide a debounced function that updates the Supabase `JSONB` column every 30 seconds or on component unmount.

## Summary

Storing the Taste Graph in Supabase is highly viable via the **JSONB** approach, offering the perfect blend of flexibility and speed. Because we've already linked our Guest to Supabase auth, we can store their graph server-side seamlessly. If we want isolated guest instances, we will pivot slightly to Anonymous Auth.
