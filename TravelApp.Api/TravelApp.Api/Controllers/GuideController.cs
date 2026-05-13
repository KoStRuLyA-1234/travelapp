using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Net;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using TravelApp.Api.Data;
using TravelApp.Api.Models;

namespace TravelApp.Api.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class GuideController : ControllerBase
    {
        // Frontend waits 90s; nginx proxy_read_timeout = 120s.
        private static readonly TimeSpan OpenRouterTimeout = TimeSpan.FromSeconds(90);

        private readonly IConfiguration _config;
        private readonly IHttpClientFactory _httpFactory;
        private readonly AppDbContext _db;
        private readonly ILogger<GuideController> _logger;

        public GuideController(
            IConfiguration config,
            IHttpClientFactory httpClientFactory,
            AppDbContext db,
            ILogger<GuideController> logger)
        {
            _config = config;
            _httpFactory = httpClientFactory;
            _db = db;
            _logger = logger;
        }

        // ── 1. Q&A / chat ────────────────────────────────────────────────────
        // Accepts optional History array → multi-turn dialogue.
        [HttpPost]
        public async Task<ActionResult<GuideResponse>> Ask([FromBody] GuideRequest request)
        {
            var apiKey = GetApiKey();
            if (apiKey is null)
                return Ok(new GuideResponse { Answer = "API-ключ OpenRouter не задан." });

            var messages = new List<object>
            {
                new
                {
                    role = "system",
                    content = "Ты туристический гид по городам России. Отвечай кратко (3-5 предложений), по делу, на русском. Без воды и markdown-разметки."
                }
            };

            // Include conversation history (if any) so multi-turn chat works.
            if (request.History is { Count: > 0 })
            {
                foreach (var m in request.History)
                {
                    if (string.IsNullOrWhiteSpace(m.Role) || string.IsNullOrWhiteSpace(m.Content)) continue;
                    if (m.Role is not ("user" or "assistant")) continue;
                    messages.Add(new { role = m.Role, content = m.Content });
                }
            }

            messages.Add(new { role = "user", content = $"Город: {request.CityName}. Вопрос: {request.Question}" });

            var (ok, answer, errorMsg) = await CallOpenRouter(BuildBody(messages, max: 1024), apiKey);
            return Ok(new GuideResponse { Answer = ok ? PostProcessGuideText(answer!) : errorMsg! });
        }

        // ── 2. Random fun fact about a city/attraction ───────────────────────
        [HttpPost("fact")]
        public async Task<ActionResult<GuideResponse>> Fact([FromBody] FactRequest request)
        {
            var apiKey = GetApiKey();
            if (apiKey is null)
                return Ok(new GuideResponse { Answer = "API-ключ OpenRouter не задан." });

            // Resolve city + attractions to give the model concrete grounding.
            City? city = null;
            List<string> attractionNames = new();
            if (request.CityId is int cid)
            {
                city = await _db.Cities.FirstOrDefaultAsync(c => c.Id == cid);
                if (city != null)
                {
                    attractionNames = await _db.Attractions
                        .Where(a => a.CityId == cid)
                        .Select(a => a.Name)
                        .Take(8)
                        .ToListAsync();
                }
            }

            var cityName = city?.Name ?? request.CityName ?? "";
            if (string.IsNullOrWhiteSpace(cityName))
                return BadRequest(new { message = "Нужен cityId или cityName." });

            var hint = attractionNames.Count > 0
                ? $" Известные достопримечательности: {string.Join(", ", attractionNames)}."
                : "";

            var messages = new object[]
            {
                new
                {
                    role = "system",
                    content = "Ты туристический гид. Дай ровно один интересный исторический или культурный факт про город — 2-3 предложения, без вступлений вроде 'А вот интересный факт'. Только русский язык."
                },
                new
                {
                    role = "user",
                    content = $"Город: {cityName}.{hint} Расскажи интересный факт."
                }
            };

            var (ok, answer, err) = await CallOpenRouter(BuildBody(messages, max: 400), apiKey);
            return Ok(new GuideResponse { Answer = ok ? PostProcessGuideText(answer!) : err! });
        }

        // ── 3. Weekend trip recommendation ───────────────────────────────────
        // Given a homeCity, picks 5 nearest cities from DB, asks the AI
        // to recommend ONE of them, returns the chosen city + reason + coords.
        [HttpPost("weekend")]
        public async Task<ActionResult<WeekendResponse>> Weekend([FromBody] WeekendRequest request)
        {
            var apiKey = GetApiKey();
            if (apiKey is null)
                return Ok(new WeekendResponse { Success = false, Error = "API-ключ OpenRouter не задан." });

            var allCities = await _db.Cities
                .Where(c => c.Latitude != null && c.Longitude != null)
                .ToListAsync();

            if (allCities.Count == 0)
                return Ok(new WeekendResponse { Success = false, Error = "В базе нет городов с координатами." });

            // Find home city (case-insensitive). If missing — pick a random city.
            var home = string.IsNullOrWhiteSpace(request.HomeCity)
                ? null
                : allCities.FirstOrDefault(c =>
                    string.Equals(c.Name.Trim(), request.HomeCity.Trim(), StringComparison.OrdinalIgnoreCase));

            List<City> candidates;
            var rnd = new Random();
            if (home is { Latitude: not null, Longitude: not null })
            {
                // Take the 8 closest, then SHUFFLE before showing to AI so the
                // model doesn't always pick the same "first" option (Claude Opus
                // is deterministic enough at temp=0.7 that we'd always get the
                // same answer otherwise — manifesting as "always Ярославль").
                candidates = allCities
                    .Where(c => c.Id != home.Id)
                    .OrderBy(c => Haversine(home.Latitude!.Value, home.Longitude!.Value, c.Latitude!.Value, c.Longitude!.Value))
                    .Take(8)
                    .OrderBy(_ => rnd.Next())
                    .Take(5)
                    .ToList();
            }
            else
            {
                // Random 5 if no home reference.
                candidates = allCities.OrderBy(_ => rnd.Next()).Take(5).ToList();
            }

            // Ask the model to pick one. We hand it a numbered list and request
            // a strict JSON shape so we can resolve back to a real city row.
            var listBlock = string.Join("\n", candidates.Select((c, i) =>
                $"{i + 1}. {c.Name} (регион: {c.Region ?? "-"}, лучший сезон: {c.BestSeason ?? "-"})"));

            var messages = new object[]
            {
                new
                {
                    role = "system",
                    content = "Ты помощник по туризму. Выбираешь один город из списка для поездки на выходные. Отвечай строго JSON-объектом без markdown."
                },
                new
                {
                    role = "user",
                    content =
                        (home is null
                            ? "Пользователь не указал родной город. "
                            : $"Пользователь живёт в городе {home.Name}. ")
                        + "Выбери ОДИН город из списка ниже для поездки на выходные.\n\n"
                        + listBlock
                        + "\n\nВерни строго такой JSON: {\"index\": <номер из списка>, \"reason\": \"1-2 предложения почему именно этот\"}"
                }
            };

            var (ok, answer, err) = await CallOpenRouter(BuildBody(messages, max: 300), apiKey);
            if (!ok) return Ok(new WeekendResponse { Success = false, Error = err });

            var (idx, reason) = ExtractWeekendChoice(answer!);
            if (idx is null || idx < 1 || idx > candidates.Count)
            {
                // AI gave us garbage — fall back to "closest city".
                idx = 1;
                reason = home is null
                    ? "Случайный выбор из ближайших городов."
                    : $"Самый близкий к {home.Name} город.";
            }

            var chosen = candidates[idx.Value - 1];
            return Ok(new WeekendResponse
            {
                Success = true,
                CityId = chosen.Id,
                CityName = chosen.Name,
                Region = chosen.Region,
                Latitude = chosen.Latitude,
                Longitude = chosen.Longitude,
                Reason = string.IsNullOrWhiteSpace(reason) ? "AI рекомендует именно этот город." : reason!
            });
        }

        // ── 4. Multi-day route generation (existing endpoint, model swapped) ──
        [HttpPost("route")]
        public async Task<ActionResult<RouteApiResponse>> GenerateRoute([FromBody] RouteRequest request)
        {
            var apiKey = GetApiKey();
            if (apiKey is null)
                return Ok(new RouteApiResponse { Success = false, Error = "API-ключ OpenRouter не задан." });

            // Ground the model with real attractions from our DB so it doesn't hallucinate.
            // We also keep their coordinates around — used after AI parse to backfill
            // each place's lat/lng so the frontend can drop pins without a Yandex
            // geocoder round-trip (which often misses AI-generated place names).
            List<Attraction> realAttractions = new();
            City? city = null;
            if (request.CityId is int cid)
            {
                city = await _db.Cities.FirstOrDefaultAsync(c => c.Id == cid);
                realAttractions = await _db.Attractions
                    .Where(a => a.CityId == cid)
                    .Take(40)
                    .ToListAsync();
            }
            // Fall back to city-by-name if CityId was missing.
            city ??= await _db.Cities.FirstOrDefaultAsync(c => c.Name == request.CityName);

            var attractionNames = realAttractions.Select(a => a.Name).ToList();

            var messages = new object[]
            {
                new
                {
                    role = "system",
                    content = "Ты генератор туристических маршрутов. Отвечай только валидным JSON-объектом. Не добавляй markdown, пояснения или текст вне JSON."
                },
                new { role = "user", content = BuildRoutePrompt(request, attractionNames) }
            };

            var (ok, answer, errorMsg) = await CallOpenRouter(BuildBody(messages, max: 2048), apiKey);
            if (!ok) return Ok(new RouteApiResponse { Success = false, Error = errorMsg });

            var days = ExtractAndParseDays(answer!);
            if (days is null || days.Count == 0)
            {
                return Ok(new RouteApiResponse
                {
                    Success = false,
                    Error = "Не удалось сгенерировать маршрут. Попробуй ещё раз."
                });
            }

            // ── Backfill coordinates ──
            // For each AI-produced place try to match an Attraction by name
            // (case-insensitive substring match in either direction). If we
            // get a hit AND that attraction has coords — use them. Otherwise
            // leave null and the frontend will fall back to the city centre.
            foreach (var day in days)
            {
                foreach (var place in day.Places)
                {
                    var match = FuzzyMatchAttraction(place.Name, realAttractions);
                    if (match is { Latitude: not null, Longitude: not null })
                    {
                        place.Latitude  = match.Latitude;
                        place.Longitude = match.Longitude;
                    }
                }
            }

            return Ok(new RouteApiResponse
            {
                Success         = true,
                Days            = days,
                CityLatitude    = city?.Latitude,
                CityLongitude   = city?.Longitude,
                CityName        = city?.Name ?? request.CityName
            });
        }

        /// <summary>
        /// Loose match: ignore case, trim, accept substring in either direction.
        /// Cheap because there are typically &lt;40 attractions per city.
        /// </summary>
        private static Attraction? FuzzyMatchAttraction(string aiName, List<Attraction> pool)
        {
            if (string.IsNullOrWhiteSpace(aiName) || pool.Count == 0) return null;
            var needle = aiName.Trim().ToLowerInvariant();
            // Exact match first.
            var exact = pool.FirstOrDefault(a => a.Name.Trim().ToLowerInvariant() == needle);
            if (exact != null) return exact;
            // Substring either way.
            return pool.FirstOrDefault(a =>
            {
                var hay = a.Name.Trim().ToLowerInvariant();
                return hay.Contains(needle) || needle.Contains(hay);
            });
        }

        // ── helpers ───────────────────────────────────────────────────────────
        private string? GetApiKey()
        {
            var key = _config["OpenRouter:ApiKey"];
            if (string.IsNullOrWhiteSpace(key))
            {
                _logger.LogError("OpenRouter ApiKey is empty. Set OpenRouter__ApiKey env var.");
                return null;
            }
            return key;
        }

        private string GetModel() => _config["OpenRouter:Model"] ?? "anthropic/claude-opus-4.6";
        private string GetFallbackModel() => _config["OpenRouter:ModelFallback"] ?? "anthropic/claude-opus-4";

        private object BuildBody(IEnumerable<object> messages, int max) => new
        {
            model = GetModel(),
            models = new[] { GetModel(), GetFallbackModel() }, // OpenRouter auto-fallback list
            messages,
            max_tokens = max,
            temperature = 0.7
        };

        private async Task<(bool ok, string? answer, string? error)> CallOpenRouter(object body, string apiKey)
        {
            var json = JsonSerializer.Serialize(body);
            var content = new StringContent(json, Encoding.UTF8, "application/json");

            var http = _httpFactory.CreateClient();
            http.Timeout = OpenRouterTimeout;
            http.DefaultRequestHeaders.Add("Authorization", $"Bearer {apiKey}");
            http.DefaultRequestHeaders.Add("HTTP-Referer", "https://travelapp.local");
            http.DefaultRequestHeaders.Add("X-Title", "TravelApp");

            HttpResponseMessage response;
            try
            {
                response = await http.PostAsync("https://openrouter.ai/api/v1/chat/completions", content);
            }
            catch (TaskCanceledException)
            {
                _logger.LogWarning("OpenRouter request timed out after {Seconds}s.", OpenRouterTimeout.TotalSeconds);
                return (false, null, "Запрос занял слишком много времени. Попробуй ещё раз через минуту.");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Network error talking to OpenRouter.");
                return (false, null, "Ошибка сети. Проверь соединение и попробуй снова.");
            }

            var responseJson = await response.Content.ReadAsStringAsync();

            switch (response.StatusCode)
            {
                case HttpStatusCode.Unauthorized:
                    _logger.LogError("OpenRouter rejected key (401).");
                    return (false, null, "Ошибка авторизации API. Проверь ключ OpenRouter.");
                case HttpStatusCode.TooManyRequests:
                    return (false, null, "Гид сейчас занят, попробуй через 20-30 секунд.");
                case HttpStatusCode.UnprocessableEntity:
                    _logger.LogWarning("OpenRouter 422: {Body}", Truncate(responseJson, 400));
                    return (false, null, "Ошибка параметров запроса к AI.");
            }

            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning("OpenRouter HTTP {Status}: {Body}",
                    (int)response.StatusCode, Truncate(responseJson, 400));
                return (false, null, "Сервис временно недоступен. Попробуй позже.");
            }

            JsonElement result;
            try { result = JsonSerializer.Deserialize<JsonElement>(responseJson); }
            catch
            {
                return (false, null, "Не удалось обработать ответ сервиса.");
            }

            if (result.TryGetProperty("error", out var err))
            {
                var msg = err.TryGetProperty("message", out var m) ? m.GetString() : "unknown";
                _logger.LogWarning("OpenRouter API error: {Msg}", msg);
                return (false, null, "Ошибка AI-сервиса. Попробуй ещё раз.");
            }

            if (!result.TryGetProperty("choices", out var choices) || choices.GetArrayLength() == 0)
                return (false, null, "Получен пустой ответ от AI.");

            var answer = choices[0].GetProperty("message").GetProperty("content").GetString();
            return string.IsNullOrWhiteSpace(answer)
                ? (false, null, "Получен пустой ответ от AI.")
                : (true, answer, null);
        }

        private static double Haversine(double lat1, double lon1, double lat2, double lon2)
        {
            const double R = 6371; // km
            double toRad(double d) => d * Math.PI / 180.0;
            var dLat = toRad(lat2 - lat1);
            var dLon = toRad(lon2 - lon1);
            var a = Math.Sin(dLat / 2) * Math.Sin(dLat / 2) +
                    Math.Cos(toRad(lat1)) * Math.Cos(toRad(lat2)) *
                    Math.Sin(dLon / 2) * Math.Sin(dLon / 2);
            return 2 * R * Math.Asin(Math.Sqrt(a));
        }

        private static (int? index, string? reason) ExtractWeekendChoice(string raw)
        {
            if (string.IsNullOrWhiteSpace(raw)) return (null, null);
            var clean = Regex.Replace(raw, @"```[a-zA-Z]*\n?|```", "", RegexOptions.IgnoreCase).Trim();
            var start = clean.IndexOf('{');
            var end   = clean.LastIndexOf('}');
            if (start < 0 || end <= start) return (null, null);
            try
            {
                using var doc = JsonDocument.Parse(clean[start..(end + 1)]);
                var root = doc.RootElement;
                int? idx = null;
                if (root.TryGetProperty("index", out var iEl))
                {
                    if (iEl.ValueKind == JsonValueKind.Number) idx = iEl.GetInt32();
                    else if (iEl.ValueKind == JsonValueKind.String && int.TryParse(iEl.GetString(), out var parsed)) idx = parsed;
                }
                var reason = root.TryGetProperty("reason", out var r) ? r.GetString() : null;
                return (idx, reason);
            }
            catch { return (null, null); }
        }

        private static string PostProcessGuideText(string text)
        {
            if (string.IsNullOrWhiteSpace(text)) return text;
            text = Regex.Replace(text, @"([.!?])([А-ЯЁA-Z])", "$1 $2");
            text = Regex.Replace(text, @"\n{3,}", "\n\n");
            return text.Trim();
        }

        private static string Truncate(string s, int max) =>
            string.IsNullOrEmpty(s) ? "" : (s.Length <= max ? s : s[..max] + "…");

        private static string BuildRoutePrompt(RouteRequest req, List<string> realAttractions)
        {
            var daysWord = req.Days switch { 1 => "день", 2 or 3 or 4 => "дня", _ => "дней" };
            var groundingHint = realAttractions.Count > 0
                ? $"\nИспользуй преимущественно эти реальные места из нашей базы: {string.Join(", ", realAttractions)}."
                : "";

            return $@"Составь туристический маршрут по городу {req.CityName} на {req.Days} {daysWord}.
Стиль путешествия: {req.Style}.
Тип компании: {req.With}.{groundingHint}

Требования:
- максимум 4 места в день;
- только реально существующие места;
- время визита в формате HH:mm;
- весь текст только на русском языке.

Верни строго такой JSON без пояснений:
{{
  ""days"": [
    {{
      ""day"": 1,
      ""title"": ""Краткая тема дня"",
      ""places"": [
        {{
          ""name"": ""Название места"",
          ""time"": ""10:00"",
          ""duration"": ""1.5 ч"",
          ""tip"": ""Короткий полезный совет""
        }}
      ]
    }}
  ]
}}";
        }

        private static List<RouteDayDto>? ExtractAndParseDays(string raw)
        {
            if (string.IsNullOrWhiteSpace(raw)) return null;
            var clean = Regex.Replace(raw, @"```[a-zA-Z]*\n?", "", RegexOptions.IgnoreCase)
                .Replace("```", "")
                .Trim();
            var start = clean.IndexOf('{');
            var end = clean.LastIndexOf('}');
            if (start < 0 || end <= start) return null;
            var candidate = clean[start..(end + 1)];
            return TryParseDays(candidate) ?? TryParseDays(RepairJson(candidate));
        }

        private static List<RouteDayDto>? TryParseDays(string jsonStr)
        {
            try
            {
                using var doc = JsonDocument.Parse(jsonStr);
                return ParseDaysFromDocument(doc);
            }
            catch { return null; }
        }

        private static List<RouteDayDto>? ParseDaysFromDocument(JsonDocument doc)
        {
            if (!doc.RootElement.TryGetProperty("days", out var daysEl) || daysEl.ValueKind != JsonValueKind.Array)
                return null;

            var result = new List<RouteDayDto>();
            var autoDay = 1;

            foreach (var dayEl in daysEl.EnumerateArray())
            {
                var dayNum = dayEl.TryGetProperty("day", out var d) ? d.GetInt32() : autoDay;
                autoDay = dayNum + 1;

                var day = new RouteDayDto
                {
                    Day = dayNum,
                    Title = dayEl.TryGetProperty("title", out var t) ? t.GetString() ?? "" : ""
                };

                if (dayEl.TryGetProperty("places", out var placesEl) && placesEl.ValueKind == JsonValueKind.Array)
                {
                    foreach (var placeEl in placesEl.EnumerateArray())
                    {
                        var name = placeEl.TryGetProperty("name", out var n) ? n.GetString() ?? "" : "";
                        if (string.IsNullOrWhiteSpace(name)) continue;

                        day.Places.Add(new RoutePlaceDto
                        {
                            Name = name,
                            Time = placeEl.TryGetProperty("time", out var ti) ? ti.GetString() ?? "" : "",
                            Duration = placeEl.TryGetProperty("duration", out var dur) ? dur.GetString() ?? "" : "",
                            Tip = placeEl.TryGetProperty("tip", out var tip) ? tip.GetString() ?? "" : ""
                        });
                    }
                }

                if (day.Places.Count > 0) result.Add(day);
            }

            return result.Count > 0 ? result : null;
        }

        private static string RepairJson(string json)
        {
            var trimmed = Regex.Replace(json.TrimEnd(), @",\s*([}\]])", "$1");
            var openBraces = trimmed.Count(c => c == '{');
            var closeBraces = trimmed.Count(c => c == '}');
            var openBrackets = trimmed.Count(c => c == '[');
            var closeBrackets = trimmed.Count(c => c == ']');
            var sb = new StringBuilder(trimmed);
            sb.Append(']', Math.Max(0, openBrackets - closeBrackets));
            sb.Append('}', Math.Max(0, openBraces - closeBraces));
            return sb.ToString();
        }
    }

    // ── DTOs ────────────────────────────────────────────────────────────────
    public class GuideRequest
    {
        public string CityName { get; set; } = "";
        public string Question { get; set; } = "";
        /// <summary>Optional conversation history for multi-turn chat.</summary>
        public List<ChatTurn>? History { get; set; }
    }

    public class ChatTurn
    {
        public string Role    { get; set; } = ""; // "user" | "assistant"
        public string Content { get; set; } = "";
    }

    public class GuideResponse
    {
        public string Answer { get; set; } = "";
    }

    public class FactRequest
    {
        public int? CityId { get; set; }
        public string? CityName { get; set; }
    }

    public class WeekendRequest
    {
        public string? HomeCity { get; set; }
    }

    public class WeekendResponse
    {
        public bool   Success  { get; set; }
        public int    CityId   { get; set; }
        public string CityName { get; set; } = "";
        public string? Region   { get; set; }
        public double? Latitude  { get; set; }
        public double? Longitude { get; set; }
        public string Reason   { get; set; } = "";
        public string? Error    { get; set; }
    }

    public class RouteRequest
    {
        public string CityName { get; set; } = "";
        public int? CityId { get; set; }
        public int Days { get; set; } = 1;
        public string Style { get; set; } = "";
        public string With { get; set; } = "";
    }

    public class RoutePlaceDto
    {
        public string  Name      { get; set; } = "";
        public string  Time      { get; set; } = "";
        public string  Duration  { get; set; } = "";
        public string  Tip       { get; set; } = "";
        /// <summary>Filled in from Attractions when we can match the AI-produced name.</summary>
        public double? Latitude  { get; set; }
        public double? Longitude { get; set; }
    }

    public class RouteDayDto
    {
        public int Day { get; set; }
        public string Title { get; set; } = "";
        public List<RoutePlaceDto> Places { get; set; } = new();
    }

    public class RouteApiResponse
    {
        public bool Success { get; set; }
        public List<RouteDayDto>? Days { get; set; }
        public string? Error { get; set; }
        /// <summary>City centre — used as a fallback for any place we couldn't geocode.</summary>
        public double? CityLatitude  { get; set; }
        public double? CityLongitude { get; set; }
        public string? CityName      { get; set; }
    }
}
