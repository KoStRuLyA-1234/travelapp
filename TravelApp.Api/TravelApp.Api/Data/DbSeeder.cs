using Microsoft.EntityFrameworkCore;
using TravelApp.Api.Models;

namespace TravelApp.Api.Data;

/// <summary>
/// Idempotent startup seeder.
///
/// Inserts a single development/QA user the first time the app starts against
/// a fresh database. Skips silently if the user already exists, so it's safe
/// to call on every Docker restart and won't clash with manually-created accounts.
///
/// Configuration (all optional — sensible defaults shipped):
///   Seed:TestUserEmail     (default: testlocal@example.com)
///   Seed:TestUserPassword  (default: Test1234)
///   Seed:TestUserName      (default: Тестовый Локальный)
///
/// Set Seed:TestUserEmail to an empty string to disable seeding entirely.
/// </summary>
public static class DbSeeder
{
    public static async Task SeedTestUserAsync(AppDbContext db, IConfiguration config, ILogger logger)
    {
        var email    = (config["Seed:TestUserEmail"] ?? "testlocal@example.com").Trim().ToLowerInvariant();
        var password = config["Seed:TestUserPassword"] ?? "Test1234";
        var name     = config["Seed:TestUserName"] ?? "Тестовый Локальный";

        if (string.IsNullOrWhiteSpace(email))
        {
            logger.LogInformation("DbSeeder skipped — Seed:TestUserEmail is empty.");
            return;
        }

        // Backfill any legacy users that have an empty Role column (added by
        // 20260509191233_AddSavedRoutesAndUserRole — older rows default to "").
        var legacyNoRole = await db.Users.Where(u => u.Role == "" || u.Role == null).ToListAsync();
        foreach (var u in legacyNoRole) u.Role = "User";
        if (legacyNoRole.Count > 0)
        {
            await db.SaveChangesAsync();
            logger.LogInformation("DbSeeder: backfilled Role='User' for {Count} legacy users.", legacyNoRole.Count);
        }

        var existing = await db.Users.FirstOrDefaultAsync(u => u.Email == email);
        if (existing != null)
        {
            // Idempotent admin promotion — testlocal is always Admin so the
            // admin panel is reachable in dev without manual SQL fiddling.
            if (existing.Role != "Admin")
            {
                existing.Role = "Admin";
                await db.SaveChangesAsync();
                logger.LogInformation("DbSeeder: promoted {Email} to Admin.", email);
            }
            else
            {
                logger.LogInformation("DbSeeder: user {Email} already exists, nothing to do.", email);
            }
            return;
        }

        var user = new User
        {
            Email             = email,
            PasswordHash      = BCrypt.Net.BCrypt.HashPassword(password),
            Name              = name,
            HomeCity          = "Москва",
            Bio               = "",
            AvatarUrl         = "",
            Role              = "Admin",   // seeded test user is admin by default
            Theme             = "dark",
            AnimationsEnabled = true,
            CreatedAt         = DateTime.UtcNow
        };

        db.Users.Add(user);
        await db.SaveChangesAsync();
        logger.LogInformation("DbSeeder: created admin test user {Email} (id {Id}).", email, user.Id);
    }

    /// <summary>
    /// Idempotent backfill of latitude/longitude for the 50 seeded cities.
    /// Only updates rows where Latitude IS NULL — never overwrites human edits.
    /// Critical for /api/guide/weekend and the roulette homeCity-haversine logic.
    /// </summary>
    public static async Task SeedCityCoordinatesAsync(AppDbContext db, ILogger logger)
    {
        // Coordinates pulled from Wikipedia/Yandex Maps city centres.
        var coords = new Dictionary<string, (double lat, double lng)>
        {
            ["Архангельск"]      = (64.5401,  40.5433),
            ["Астрахань"]        = (46.3479,  48.0336),
            ["Бахчисарай"]       = (44.7517,  33.8575),
            ["Великий Новгород"] = (58.5215,  31.2755),
            ["Владивосток"]      = (43.1155, 131.8855),
            ["Владимир"]         = (56.1290,  40.4070),
            ["Волгоград"]        = (48.7080,  44.5133),
            ["Вологда"]          = (59.2239,  39.8840),
            ["Дербент"]          = (42.0678,  48.2898),
            ["Екатеринбург"]     = (56.8389,  60.6057),
            ["Иваново"]          = (57.0000,  40.9739),
            ["Иркутск"]          = (52.2864, 104.2807),
            ["Казань"]           = (55.7964,  49.1089),
            ["Калининград"]      = (54.7104,  20.4522),
            ["Кисловодск"]       = (43.9028,  42.7189),
            ["Кострома"]         = (57.7676,  40.9269),
            ["Краснодар"]        = (45.0355,  38.9753),
            ["Красноярск"]       = (56.0153,  92.8932),
            ["Липецк"]           = (52.6088,  39.5994),
            ["Москва"]           = (55.7558,  37.6173),
            ["Мурманск"]         = (68.9585,  33.0827),
            ["Нижний Новгород"]  = (56.3269,  44.0059),
            ["Новосибирск"]      = (55.0084,  82.9357),
            ["Омск"]             = (54.9885,  73.3242),
            ["Орёл"]             = (52.9700,  36.0697),
            ["Пермь"]            = (58.0105,  56.2502),
            ["Петрозаводск"]     = (61.7849,  34.3469),
            ["Псков"]            = (57.8194,  28.3326),
            ["Пятигорск"]        = (44.0486,  43.0594),
            ["Ростов-на-Дону"]   = (47.2357,  39.7015),
            ["Рязань"]           = (54.6269,  39.6916),
            ["Самара"]           = (53.1959,  50.1003),
            ["Санкт-Петербург"]  = (59.9311,  30.3609),
            ["Саратов"]          = (51.5331,  46.0342),
            ["Севастополь"]      = (44.6166,  33.5254),
            ["Смоленск"]         = (54.7826,  32.0453),
            ["Сочи"]             = (43.5855,  39.7231),
            ["Судак"]            = (44.8492,  34.9762),
            ["Суздаль"]          = (56.4194,  40.4493),  // distinct from Шуя
            ["Тамбов"]           = (52.7213,  41.4521),
            ["Томск"]            = (56.4847,  84.9476),
            ["Тула"]             = (54.1961,  37.6182),
            ["Уфа"]              = (54.7388,  55.9721),
            ["Хабаровск"]        = (48.4827, 135.0838),
            ["Чебоксары"]        = (56.1322,  47.2519),
            ["Чита"]             = (52.0316, 113.5018),
            ["Шуя"]              = (56.8543,  41.3872),
            ["Якутск"]           = (62.0339, 129.7331),
            ["Ялта"]             = (44.4952,  34.1664),
            ["Ярославль"]        = (57.6261,  39.8845)
        };

        // Includes NULLs *and* rows whose coords drift more than ~10km from
        // our reference. The latter catches stale seeds (e.g. Суздаль once
        // had Шуя's coords by mistake) without touching legit human edits.
        var allCities = await db.Cities.ToListAsync();
        var fixedCount = 0;

        foreach (var city in allCities)
        {
            if (!coords.TryGetValue(city.Name.Trim(), out var ll)) continue;

            var needsFix = city.Latitude == null
                        || city.Longitude == null
                        || Math.Abs(city.Latitude.Value  - ll.lat) > 0.10
                        || Math.Abs(city.Longitude.Value - ll.lng) > 0.10;

            if (needsFix)
            {
                city.Latitude  = ll.lat;
                city.Longitude = ll.lng;
                fixedCount++;
            }
        }

        if (fixedCount > 0)
        {
            await db.SaveChangesAsync();
            logger.LogInformation("DbSeeder: backfilled / corrected coords for {Count} cities.", fixedCount);
        }
        else
        {
            logger.LogInformation("DbSeeder: all cities already have correct coordinates.");
        }
    }
}
