using Microsoft.AspNetCore.Mvc;
using System.Net;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace TravelApp.Api.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class GuideController : ControllerBase
    {
        // Backend waits up to 90s for OpenRouter.
        // nginx proxy_read_timeout is 120s — this gives the backend time to return a friendly error first.
        private static readonly TimeSpan OpenRouterTimeout = TimeSpan.FromSeconds(90);

        private readonly IConfiguration _config;
        private readonly IHttpClientFactory _httpFactory;

        public GuideController(IConfiguration config, IHttpClientFactory httpClientFactory)
        {
            _config = config;
            _httpFactory = httpClientFactory;
        }

        // ── Chat guide ─────────────────────────────────────────────────────────
        [HttpPost]
        public async Task<ActionResult<GuideResponse>> Ask([FromBody] GuideRequest request)
        {
            var apiKey = GetApiKey();
            if (apiKey is null)
                return Ok(new GuideResponse { Answer = "Ошибка конфигурации: API ключ не задан." });

            var body = new
            {
                model = "nvidia/nemotron-3-super-120b-a12b:free",
                messages = new object[]
                {
                    new { role = "system", content = "Ты туристический гид по городам России. Отвечай кратко, по делу, на русском языке. Без лишней воды. Максимум 3–5 предложений если не просят подробно." },
                    new { role = "user", content = $"Город: {request.CityName}. Вопрос: {request.Question}" }
                },
                max_tokens = 1024
            };

            var (ok, answer, errorMsg) = await CallOpenRouter(body);
            if (!ok) return Ok(new GuideResponse { Answer = errorMsg! });

            return Ok(new GuideResponse { Answer = PostProcessGuideText(answer!) });
        }

        // ── Route generator ────────────────────────────────────────────────────
        [HttpPost("route")]
        public async Task<ActionResult<RouteApiResponse>> GenerateRoute([FromBody] RouteRequest request)
        {
            var apiKey = GetApiKey();
            if (apiKey is null)
                return Ok(new RouteApiResponse { Success = false, Error = "Ошибка конфигурации: API ключ не задан." });

            Console.WriteLine($"[Route] {request.CityName} · {request.Days}д · {request.Style} · {request.With}");

            var body = new
            {
                model = "nvidia/nemotron-3-super-120b-a12b:free",
                messages = new object[]
                {
                    new
                    {
                        role = "system",
                        content = "Ты генератор туристических маршрутов. Отвечай ТОЛЬКО валидным JSON. " +
                                  "Никакого текста до или после JSON. Никаких markdown-блоков ```json. " +
                                  "Только сам JSON-объект."
                    },
                    new { role = "user", content = BuildRoutePrompt(request) }
                },
                max_tokens = 2048
            };

            var (ok, answer, errorMsg) = await CallOpenRouter(body);
            if (!ok) return Ok(new RouteApiResponse { Success = false, Error = errorMsg });

            Console.WriteLine($"[Route] Raw answer length: {answer!.Length}");

            var days = ExtractAndParseDays(answer);
            if (days is null || days.Count == 0)
            {
                Console.WriteLine($"[Route] Parse failed. First 300 chars: {answer[..Math.Min(300, answer.Length)]}");
                return Ok(new RouteApiResponse
                {
                    Success = false,
                    Error = "Не удалось сгенерировать маршрут. Попробуй ещё раз."
                });
            }

            Console.WriteLine($"[Route] Parsed {days.Count} day(s), total {days.Sum(d => d.Places.Count)} places");
            return Ok(new RouteApiResponse { Success = true, Days = days });
        }

        // ── Private helpers ────────────────────────────────────────────────────

        private string? GetApiKey()
        {
            var key = _config["OpenRouter:ApiKey"];
            if (string.IsNullOrWhiteSpace(key))
            {
                Console.WriteLine("[OpenRouter] ERROR: ApiKey is null or empty. Check appsettings.json or OpenRouter__ApiKey env var.");
                return null;
            }
            var preview = key.Length >= 8 ? $"{key[..4]}...{key[^4..]}" : "****";
            Console.WriteLine($"[OpenRouter] Key: {preview} (len={key.Length})");
            return key;
        }

        private async Task<(bool ok, string? answer, string? error)> CallOpenRouter(object body)
        {
            var apiKey = _config["OpenRouter:ApiKey"]!;
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
                Console.WriteLine("[OpenRouter] Timed out after 90s");
                return (false, null, "Запрос занял слишком много времени. Попробуй ещё раз через минуту.");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[OpenRouter] Network error: {ex.Message}");
                return (false, null, "Ошибка сети. Проверь соединение и попробуй снова.");
            }

            var responseJson = await response.Content.ReadAsStringAsync();
            Console.WriteLine($"[OpenRouter] HTTP {(int)response.StatusCode}");

            switch (response.StatusCode)
            {
                case HttpStatusCode.Unauthorized:
                    Console.WriteLine("[OpenRouter] 401 — API key is invalid or revoked");
                    return (false, null, "Ошибка авторизации API. Проверь ключ OpenRouter.");

                case HttpStatusCode.TooManyRequests:
                    return (false, null, "Гид сейчас занят, попробуй через 20–30 секунд.");

                case HttpStatusCode.UnprocessableEntity: // 422 — bad model/params
                    Console.WriteLine($"[OpenRouter] 422: {responseJson}");
                    return (false, null, "Ошибка параметров запроса к AI.");
            }

            if (!response.IsSuccessStatusCode)
            {
                Console.WriteLine($"[OpenRouter] Error {(int)response.StatusCode}: {responseJson[..Math.Min(200, responseJson.Length)]}");
                return (false, null, "Сервис временно недоступен. Попробуй позже.");
            }

            JsonElement result;
            try { result = JsonSerializer.Deserialize<JsonElement>(responseJson); }
            catch
            {
                Console.WriteLine($"[OpenRouter] Could not parse response: {responseJson[..Math.Min(200, responseJson.Length)]}");
                return (false, null, "Не удалось обработать ответ сервиса.");
            }

            if (result.TryGetProperty("error", out var err))
            {
                var msg = err.TryGetProperty("message", out var m) ? m.GetString() : "unknown";
                Console.WriteLine($"[OpenRouter] API error: {msg}");
                return (false, null, "Ошибка. Попробуй ещё раз.");
            }

            if (!result.TryGetProperty("choices", out var choices) || choices.GetArrayLength() == 0)
            {
                Console.WriteLine("[OpenRouter] Empty choices");
                return (false, null, "Получен пустой ответ от AI.");
            }

            var answer = choices[0].GetProperty("message").GetProperty("content").GetString();
            if (string.IsNullOrWhiteSpace(answer))
                return (false, null, "Получен пустой ответ от AI.");

            return (true, answer, null);
        }

        // Fix common text artifacts in conversational AI responses
        private static string PostProcessGuideText(string text)
        {
            if (string.IsNullOrWhiteSpace(text)) return text;

            // Fix missing space after sentence-ending punctuation before a capital letter
            text = Regex.Replace(text, @"([.!?])([А-ЯЁA-Z])", "$1 $2");

            // Normalize 3+ consecutive newlines to 2
            text = Regex.Replace(text, @"\n{3,}", "\n\n");

            return text.Trim();
        }

        private static string BuildRoutePrompt(RouteRequest req)
        {
            var daysWord = req.Days switch { 1 => "день", 2 or 3 or 4 => "дня", _ => "дней" };

            return $@"Составь туристический маршрут по городу {req.CityName} на {req.Days} {daysWord}.
Стиль путешествия: {req.Style}.
Тип компании: {req.With}.

Требования к маршруту:
- Максимум 4 места в день
- Только реально существующие места в {req.CityName}
- Время визита в формате ЧЧ:ММ (например 10:00)
- Весь текст только на русском языке

Верни строго следующий JSON без каких-либо пояснений или текста вне JSON:
{{
  ""days"": [
    {{
      ""day"": 1,
      ""title"": ""Краткое название темы дня"",
      ""places"": [
        {{
          ""name"": ""Название места"",
          ""time"": ""10:00"",
          ""duration"": ""1.5 ч"",
          ""tip"": ""Полезный совет для посетителя""
        }}
      ]
    }}
  ]
}}";
        }

        // Extract JSON object from raw model output and parse into route days
        private static List<RouteDayDto>? ExtractAndParseDays(string raw)
        {
            if (string.IsNullOrWhiteSpace(raw)) return null;

            // Strip markdown code blocks
            var clean = Regex.Replace(raw, @"```[a-zA-Z]*\n?", "", RegexOptions.IgnoreCase)
                             .Replace("```", "")
                             .Trim();

            var start = clean.IndexOf('{');
            if (start < 0) return null;

            var end = clean.LastIndexOf('}');
            if (end <= start) return null;

            var candidate = clean[start..(end + 1)];

            // First attempt: parse as-is
            var result = TryParseDays(candidate);
            if (result is not null) return result;

            // Second attempt: repair truncated / trailing-comma JSON
            result = TryParseDays(RepairJson(candidate));
            if (result is not null) return result;

            return null;
        }

        private static List<RouteDayDto>? TryParseDays(string jsonStr)
        {
            if (string.IsNullOrWhiteSpace(jsonStr)) return null;
            try
            {
                using var doc = JsonDocument.Parse(jsonStr);
                return ParseDaysFromDocument(doc);
            }
            catch { return null; }
        }

        private static List<RouteDayDto>? ParseDaysFromDocument(JsonDocument doc)
        {
            if (!doc.RootElement.TryGetProperty("days", out var daysEl)) return null;
            if (daysEl.ValueKind != JsonValueKind.Array) return null;

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
            // Remove trailing comma before ] or }
            var trimmed = Regex.Replace(json.TrimEnd(), @",\s*([}\]])", "$1");

            var openBraces   = trimmed.Count(c => c == '{');
            var closeBraces  = trimmed.Count(c => c == '}');
            var openBrackets = trimmed.Count(c => c == '[');
            var closeBrackets= trimmed.Count(c => c == ']');

            var sb = new StringBuilder(trimmed);
            sb.Append(']', Math.Max(0, openBrackets - closeBrackets));
            sb.Append('}', Math.Max(0, openBraces  - closeBraces));

            return sb.ToString();
        }
    }

    // ── DTOs ───────────────────────────────────────────────────────────────────
    public class GuideRequest  { public string CityName { get; set; } = ""; public string Question { get; set; } = ""; }
    public class GuideResponse { public string Answer   { get; set; } = ""; }

    public class RouteRequest
    {
        public string CityName { get; set; } = "";
        public int    Days     { get; set; } = 1;
        public string Style    { get; set; } = "";
        public string With     { get; set; } = "";
    }

    public class RoutePlaceDto
    {
        public string Name     { get; set; } = "";
        public string Time     { get; set; } = "";
        public string Duration { get; set; } = "";
        public string Tip      { get; set; } = "";
    }

    public class RouteDayDto
    {
        public int    Day    { get; set; }
        public string Title  { get; set; } = "";
        public List<RoutePlaceDto> Places { get; set; } = new();
    }

    public class RouteApiResponse
    {
        public bool               Success { get; set; }
        public List<RouteDayDto>? Days    { get; set; }
        public string?            Error   { get; set; }
    }
}
