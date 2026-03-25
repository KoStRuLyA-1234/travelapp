namespace TravelApp.Api.Models;

public class City
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public string Description { get; set; } = "";
    public string ImageUrl { get; set; } = "";
    public double Rating { get; set; }
    public int Population { get; set; }
    public string Tags { get; set; } = "";
    public string SearchQuery { get; set; } = ""; // ← новое

}