using Microsoft.AspNetCore.Mvc;
using System.Text;
using System.Text.Json;

namespace TravelApp.Api.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class GuideController : ControllerBase
    {
        private readonly IConfiguration _config;
        private readonly HttpClient _http;

        public GuideController(IConfiguration config, IHttpClientFactory httpClientFactory)
        {
            _config = config;
            _http = httpClientFactory.CreateClient();
        }

        [HttpPost]
        public async Task<ActionResult<GuideResponse>> Ask([FromBody] GuideRequest request)
        {
            var apiKey = _config["OpenRouter:ApiKey"];

            var body = new
            {
                model = "nvidia/nemotron-3-super-120b-a12b:free",
                messages = new[]
                {
                    new
                    {
                        role = "user",
                        content = $"Ты туристический гид по городам России. " +
                                  $"Пользователь смотрит информацию о городе {request.CityName}. " +
                                  $"Вопрос: {request.Question}. " +
                                  $"Отвечай кратко, по делу, на русском языке."
                    }
                },
                max_tokens = 2048
            };

            var json = JsonSerializer.Serialize(body);
            var content = new StringContent(json, Encoding.UTF8, "application/json");

            _http.DefaultRequestHeaders.Clear();
            _http.DefaultRequestHeaders.Add("Authorization", $"Bearer {apiKey}");
            _http.DefaultRequestHeaders.Add("HTTP-Referer", "http://localhost:4200");
            _http.DefaultRequestHeaders.Add("X-Title", "TravelApp");

            var response = await _http.PostAsync(
                "https://openrouter.ai/api/v1/chat/completions", content);

            var responseJson = await response.Content.ReadAsStringAsync();
            Console.WriteLine("OpenRouter ответ: " + responseJson);

            var result = JsonSerializer.Deserialize<JsonElement>(responseJson);

            if (result.TryGetProperty("error", out var error))
            {
                var errorMessage = error.GetProperty("message").GetString();
                if (errorMessage?.Contains("429") == true ||
                    errorMessage?.Contains("rate-limited") == true)
                {
                    return Ok(new GuideResponse
                    {
                        Answer = "Гид сейчас занят, попробуй через 10-20 секунд."
                    });
                }
                return Ok(new GuideResponse { Answer = "Ошибка. Попробуй ещё раз." });
            }

            var choices = result.GetProperty("choices");

            if (choices.GetArrayLength() == 0)
            {
                return Ok(new GuideResponse { Answer = "Не удалось получить ответ" });
            }

            var answer = choices[0]
                .GetProperty("message")
                .GetProperty("content")
                .GetString();

            if (string.IsNullOrWhiteSpace(answer))
            {
                return Ok(new GuideResponse { Answer = "Не удалось получить ответ" });
            }

            return Ok(new GuideResponse { Answer = answer });
        }
    }

    public class GuideRequest
    {
        public string CityName { get; set; } = "";
        public string Question { get; set; } = "";
    }

    public class GuideResponse
    {
        public string Answer { get; set; } = "";
    }
}