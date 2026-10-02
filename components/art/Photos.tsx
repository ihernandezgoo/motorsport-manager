import Image from "next/image";
import { useState } from "react";
import { carPhotoUrl, driverPhotoUrl, type PhotoKind } from "@/lib/game/data/media";
import { helmetOf, liveryOf } from "@/lib/game/data/liveries";
import type { Driver, SeriesId, Team } from "@/lib/game/types";
import { cx } from "../ui";
import { CarSide } from "./CarArt";
import { HelmetArt } from "./HelmetArt";

/**
 * Foto oficial del piloto (F1, F2 o F3) sobre un degradado con el color del equipo.
 * Si no hay foto o no carga, muestra su casco.
 */
export function DriverPortrait({
  driver,
  color,
  kind = "head",
  className,
  rounded = "rounded-lg",
}: {
  driver: Pick<Driver, "id" | "teamId" | "first" | "last" | "number" | "nat">;
  color?: string;
  kind?: PhotoKind;
  className?: string;
  rounded?: string;
}) {
  const [failed, setFailed] = useState(false);
  const url = driverPhotoUrl(driver.id, kind, kind === "head" ? 240 : 440);
  return (
    <div
      className={cx("relative shrink-0 overflow-hidden", rounded, className)}
      style={color ? { background: `linear-gradient(160deg, ${color} 0%, ${color}66 45%, #10141b 100%)` } : undefined}
    >
      {url && !failed ? (
        <Image
          src={url}
          alt={`${driver.first} ${driver.last}`}
          fill
          unoptimized
          sizes="240px"
          className={kind === "head" ? "object-cover" : "object-contain object-bottom"}
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="absolute inset-0 grid place-items-center p-[8%]">
          <HelmetArt design={helmetOf(driver)} number={driver.number} fill />
        </div>
      )}
    </div>
  );
}

/** Imagen oficial del coche de perfil (F1, F2 o F3) o la ilustración con la decoración del equipo. */
export function TeamCar({ team, series, number, helmet, className }: { team: Team; series: SeriesId; number?: number; helmet?: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  const url = carPhotoUrl(team.id, 448);
  if (!url || failed) return <CarSide livery={liveryOf(team)} series={series} number={number} helmet={helmet} className={className} />;
  return (
    <div className={cx("relative", className)}>
      <Image src={url} alt={`Coche de ${team.name}`} fill unoptimized sizes="900px" className="object-contain" onError={() => setFailed(true)} />
    </div>
  );
}
