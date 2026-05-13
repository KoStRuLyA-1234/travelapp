# TravelApp: review, schema and deployment notes

## Review summary

Fixed or addressed:

- API secrets were stored in `appsettings.json` and `.env.example`. The committed examples now use placeholders; real values should live in Render/Vercel/Docker environment variables.
- Several user-facing Russian strings in backend/frontend were unreadable in the app. Main auth, city, search, saved, profile, guide and navigation screens now use readable Russian labels.
- Favorites were stored only in `localStorage`. They are now persisted per user in PostgreSQL through authenticated API endpoints.
- City search only checked city names on the client. Search now uses API filters and also checks city descriptions, tags and attraction data.
- `CitiesController` created a raw `HttpClient` for Wikipedia photos and did not handle enrichment failures. It now uses `IHttpClientFactory` and treats photo lookup as best-effort.
- Profile API was missing. `/api/auth/me` now supports reading and updating profile data.
- Reviews and attractions were missing from the domain model. The API now supports city reviews and attraction search.

Remaining risks:

- The AI route generator still depends on OpenRouter availability and model response quality.
- The frontend keeps the existing mobile-first visual approach. A desktop-specific layout would improve wide screens.
- `appsettings.json` still contains local development database defaults. Use environment variables for production secrets.

## Database additions

The existing `Users` and `Cities` tables are preserved and extended.

Added to `Users`:

- `Bio`
- `AvatarUrl`
- `UpdatedAt`

Added to `Cities`:

- `Region`
- `Latitude`
- `Longitude`
- `BestSeason`
- `AverageTripDays`

New tables:

- `Attractions`: sights and places linked to a city.
- `TravelRoutes`: saved or curated routes linked to a city and optionally a user.
- `RouteStops`: ordered route points linked to attractions.
- `Reviews`: user reviews for cities and optionally attractions.
- `Favorites`: user-city saved list with a unique `(UserId, CityId)` index.

SQL script:

- `database/travelapp_schema.sql`

EF migration:

- `TravelApp.Api/TravelApp.Api/Migrations/20260502120000_ExpandTravelSchema.cs`

## API additions

Authentication:

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `PUT /api/auth/me`

Cities/search:

- `GET /api/cities?q=&region=&type=&favoritesOnly=`
- `GET /api/cities/filters`
- `GET /api/cities/{id}`
- `GET /api/cities/{id}/photo`

Attractions:

- `GET /api/attractions?cityId=&type=&q=`
- `GET /api/cities/{cityId}/attractions`

Favorites:

- `GET /api/favorites`
- `GET /api/favorites/ids`
- `POST /api/favorites/{cityId}`
- `DELETE /api/favorites/{cityId}`

Reviews:

- `GET /api/cities/{cityId}/reviews`
- `POST /api/cities/{cityId}/reviews`
- `DELETE /api/reviews/{id}`

Routes:

- `GET /api/cities/{cityId}/routes`
- `POST /api/cities/{cityId}/routes`

## Local testing

Backend:

```powershell
dotnet build TravelApp.Api\TravelApp.Api.sln
dotnet run --project TravelApp.Api\TravelApp.Api
```

Frontend:

```powershell
cd TravelApp.Client
npm run build
npm start
```

Docker:

```powershell
docker compose up --build
```

Manual smoke test:

1. Register a user with email and password.
2. Open the city list and a city detail page.
3. Add a city to favorites, then verify it appears on the saved page.
4. Submit a review on a city and verify the review list updates.
5. Search by city name, region and attraction type.
6. Generate a route only after `OPENROUTER_API_KEY` is configured.

## Deployment

Render backend environment variables:

- `ConnectionStrings__DefaultConnection`
- `Jwt__Key`
- `OpenRouter__ApiKey`
- `CorsOrigins__0=https://your-vercel-domain.vercel.app`

Vercel frontend:

- Update `src/environments/environment.prod.ts` if the Render API URL changes.
- Rebuild after changing the API URL.

Docker:

- Keep `.env` out of Git.
- Fill `OPENROUTER_API_KEY`, `JWT_KEY` and `POSTGRES_PASSWORD`.
- The backend applies EF migrations on startup through `Database.Migrate()`.

## Further improvements

- Add refresh tokens and password reset.
- Add admin-only city/attraction management.
- Add seeded attractions for the largest cities.
- Add route saving from the AI route planner into `TravelRoutes`.
- Add integration tests for auth, favorites and reviews.
- Add desktop layout variants for city detail and search.
