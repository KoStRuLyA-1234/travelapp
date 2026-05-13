using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TravelApp.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddSavedRoutesAndUserRole : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_RouteStops_Attractions_AttractionId",
                table: "RouteStops");

            migrationBuilder.AddColumn<string>(
                name: "Role",
                table: "Users",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "AiSummary",
                table: "TravelRoutes",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "ContentHash",
                table: "TravelRoutes",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<bool>(
                name: "IsAiGenerated",
                table: "TravelRoutes",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "Tags",
                table: "TravelRoutes",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AlterColumn<int>(
                name: "AttractionId",
                table: "RouteStops",
                type: "integer",
                nullable: true,
                oldClrType: typeof(int),
                oldType: "integer");

            migrationBuilder.AddColumn<string>(
                name: "DurationLabel",
                table: "RouteStops",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<double>(
                name: "Latitude",
                table: "RouteStops",
                type: "double precision",
                nullable: true);

            migrationBuilder.AddColumn<double>(
                name: "Longitude",
                table: "RouteStops",
                type: "double precision",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PlaceName",
                table: "RouteStops",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddForeignKey(
                name: "FK_RouteStops_Attractions_AttractionId",
                table: "RouteStops",
                column: "AttractionId",
                principalTable: "Attractions",
                principalColumn: "Id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_RouteStops_Attractions_AttractionId",
                table: "RouteStops");

            migrationBuilder.DropColumn(
                name: "Role",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "AiSummary",
                table: "TravelRoutes");

            migrationBuilder.DropColumn(
                name: "ContentHash",
                table: "TravelRoutes");

            migrationBuilder.DropColumn(
                name: "IsAiGenerated",
                table: "TravelRoutes");

            migrationBuilder.DropColumn(
                name: "Tags",
                table: "TravelRoutes");

            migrationBuilder.DropColumn(
                name: "DurationLabel",
                table: "RouteStops");

            migrationBuilder.DropColumn(
                name: "Latitude",
                table: "RouteStops");

            migrationBuilder.DropColumn(
                name: "Longitude",
                table: "RouteStops");

            migrationBuilder.DropColumn(
                name: "PlaceName",
                table: "RouteStops");

            migrationBuilder.AlterColumn<int>(
                name: "AttractionId",
                table: "RouteStops",
                type: "integer",
                nullable: false,
                defaultValue: 0,
                oldClrType: typeof(int),
                oldType: "integer",
                oldNullable: true);

            migrationBuilder.AddForeignKey(
                name: "FK_RouteStops_Attractions_AttractionId",
                table: "RouteStops",
                column: "AttractionId",
                principalTable: "Attractions",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);
        }
    }
}
