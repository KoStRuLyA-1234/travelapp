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
    public string SearchQuery { get; set; } = "";

    // Extra city metadata supports search, filters and maps while keeping old rows valid.
    public string Region { get; set; } = "";
    public double? Latitude { get; set; }
    public double? Longitude { get; set; }
    public string BestSeason { get; set; } = "";
    public int AverageTripDays { get; set; } = 2;

    public List<Attraction> Attractions { get; set; } = new();
    public List<Review> Reviews { get; set; } = new();
    public List<Favorite> Favorites { get; set; } = new();
    public List<TravelRoute> Routes { get; set; } = new();
}
