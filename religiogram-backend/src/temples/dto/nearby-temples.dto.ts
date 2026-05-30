import { Type } from 'class-transformer';
import {
  IsInt,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';

/**
 * Query params for GET /temples/nearby.
 *
 * Two ways to specify the centre:
 *   1. `lat` + `lng`  — precise geolocation from the device
 *   2. `city`         — slug from our launch-city registry, used when the
 *                       user denied location permission (city-first UX)
 *
 * At least one path must be populated. When `city` is provided without
 * coords, the controller / service rewrites `lat`/`lng` using the civic-
 * centre mapping in `cities.config.ts`. Coords always win if both are
 * present — you shouldn't deny the user a precise answer just because
 * they also have a saved city.
 *
 * Bounds:
 *   lat / lng : WGS84 decimal degrees, strictly validated by class-validator
 *   radiusKm  : 1–50 km (default 10). Larger radii hit the PostGIS index
 *               harder; 50 km is the practical upper bound before the result
 *               set becomes uselessly huge.
 *   limit     : 1–50 results (default 20).
 */
export class NearbyTemplesDto {
  @ValidateIf((o: NearbyTemplesDto) => !o.city)
  @IsLatitude()
  @Type(() => Number)
  lat?: number;

  @ValidateIf((o: NearbyTemplesDto) => !o.city)
  @IsLongitude()
  @Type(() => Number)
  lng?: number;

  @ValidateIf((o: NearbyTemplesDto) => o.lat === undefined)
  @IsOptional()
  @IsString()
  @Length(2, 60)
  city?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  @Type(() => Number)
  radiusKm: number = 10;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  @Type(() => Number)
  limit: number = 20;
}
