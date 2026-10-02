// Fotos oficiales de pilotos y coches (temporada 2026):
//  - F1 desde formula1.com (media.formula1.com)
//  - F2 y F3 desde fiaformula2.com / fiaformula3.com (res.cloudinary.com/prod-f2f3)
// No se incluyen en el proyecto: el navegador las carga directamente de esos servidores.
// Las imágenes son propiedad de sus titulares; úsalas solo para uso personal.

import type { SeriesId } from "../types";

export type PhotoKind = "head" | "full";

interface SeriesMedia {
  base: string;
  version: string;
  driverFallback: string;
  carFallback: string;
}

const MEDIA: Record<SeriesId, SeriesMedia> = {
  f1: {
    base: "https://media.formula1.com/image/upload",
    version: "v1740000001/common/f1/2026",
    driverFallback: "d_common:f1:2026:fallback:driver:2026fallbackdriverright.webp",
    carFallback: "d_common:f1:2026:fallback:car:2026fallbackcarright.webp",
  },
  f2: {
    base: "https://res.cloudinary.com/prod-f2f3",
    version: "v1770000000/common/f2/2026",
    driverFallback: "d_common:f2:2026:fallback:driver:2026fallbackdriverright.webp",
    carFallback: "d_common:f2:2026:fallback:car:2026fallbackcarleft.webp",
  },
  f3: {
    base: "https://res.cloudinary.com/prod-f2f3",
    version: "v1770000000/common/f3/2026",
    driverFallback: "d_common:f3:2026:fallback:driver:2026fallbackdriverright.webp",
    carFallback: "d_common:f3:2026:fallback:car:2026fallbackcarleft.webp",
  },
};

/** Equipo del juego → identificador del equipo en la web oficial. */
const TEAM_SLUG: Record<string, string> = {
  mercedes: "mercedes",
  ferrari: "ferrari",
  mclaren: "mclaren",
  red_bull: "redbullracing",
  racing_bulls: "racingbulls",
  alpine: "alpine",
  haas: "haasf1team",
  williams: "williams",
  audi: "audi",
  aston_martin: "astonmartin",
  cadillac: "cadillac",

  f2_invicta: "invictaracing",
  f2_hitech: "hitech",
  f2_campos: "camposracing",
  f2_dams: "damslucasoil",
  f2_mp: "mpmotorsport",
  f2_prema: "premaracing",
  f2_rodin: "rodinmotorsport",
  f2_art: "artgrandprix",
  f2_aix: "aixracing",
  f2_var: "vanamersfoortracing",
  f2_trident: "trident",

  f3_campos: "camposracing",
  f3_trident: "trident",
  f3_mp: "mpmotorsport",
  f3_art: "artgrandprix",
  f3_var: "vanamersfoortracing",
  f3_rodin: "rodinmotorsport",
  f3_prema: "premaracing",
  f3_hitech: "hitech",
  f3_dams: "damslucasoil",
  f3_aix: "aixracing",
};

/**
 * Piloto del juego → [equipo en la web, código del piloto].
 * Las fotos están publicadas bajo el equipo de origen, así que se guarda junto al código:
 * si el piloto cambia de equipo en la partida, la foto sigue funcionando.
 */
const DRIVER_PHOTO: Record<string, [team: string, code: string]> = {
  russell: ["mercedes", "georus01"],
  antonelli: ["mercedes", "andant01"],
  leclerc: ["ferrari", "chalec01"],
  hamilton: ["ferrari", "lewham01"],
  norris: ["mclaren", "lannor01"],
  piastri: ["mclaren", "oscpia01"],
  verstappen: ["red_bull", "maxver01"],
  hadjar: ["red_bull", "isahad01"],
  lawson: ["racing_bulls", "lialaw01"],
  lindblad: ["racing_bulls", "arvlin01"],
  gasly: ["alpine", "piegas01"],
  colapinto: ["alpine", "fracol01"],
  ocon: ["haas", "estoco01"],
  bearman: ["haas", "olibea01"],
  hulkenberg: ["audi", "nichul01"],
  bortoleto: ["audi", "gabbor01"],
  sainz: ["williams", "carsai01"],
  albon: ["williams", "alealb01"],
  alonso: ["aston_martin", "feralo01"],
  stroll: ["aston_martin", "lanstr01"],
  perez: ["cadillac", "serper01"],
  bottas: ["cadillac", "valbot01"],

  f2_camara: ["f2_invicta", "rafcam01"],
  f2_durksen: ["f2_invicta", "josdur01"],
  f2_miyata: ["f2_hitech", "ritmiy01"],
  f2_herta: ["f2_hitech", "colher01"],
  f2_leon: ["f2_campos", "noeleo01"],
  f2_tsolov: ["f2_campos", "niktso01"],
  f2_beganovic: ["f2_dams", "dinbeg01"],
  f2_bilinski: ["f2_dams", "rombil01"],
  f2_mini: ["f2_mp", "gabmin01"],
  f2_goethe: ["f2_mp", "oligoe01"],
  f2_montoya: ["f2_prema", "sebmon01"],
  f2_boya: ["f2_prema", "marboy01"],
  f2_stenshorne: ["f2_rodin", "marste01"],
  f2_dunne: ["f2_rodin", "aledun01"],
  f2_maini: ["f2_art", "kusmai01"],
  f2_inthraphuvasak: ["f2_art", "tasint01"],
  f2_fittipaldi: ["f2_aix", "emefit02"],
  f2_shields: ["f2_aix", "ciashi01"],
  f2_villagomez: ["f2_var", "rafvil01"],
  f2_vanhoepen: ["f2_trident", "lauvan01"],
  f2_bennett: ["f2_trident", "johben01"],

  f3_nael: ["f3_campos", "thenae01"],
  f3_ugochukwu: ["f3_campos", "ugougo01"],
  f3_rivera: ["f3_campos", "ernriv01"],
  f3_stromsted: ["f3_trident", "noastr01"],
  f3_slater: ["f3_trident", "fresla01"],
  f3_depalo: ["f3_trident", "matdep01"],
  f3_colnaghi: ["f3_mp", "matcol01"],
  f3_taponen: ["f3_mp", "tuutap01"],
  f3_giusti: ["f3_mp", "alegus01"],
  f3_kato: ["f3_art", "taikat01"],
  f3_gladysz: ["f3_art", "macgla01"],
  f3_yamakoshi: ["f3_var", "hiyyam01"],
  f3_deligny: ["f3_var", "enzdil01"],
  f3_delpino: ["f3_var", "brudel01"],
  f3_clerot: ["f3_rodin", "pedcle01"],
  f3_badoer: ["f3_rodin", "brabad01"],
  f3_wharton: ["f3_prema", "jamwha01"],
  f3_garfias: ["f3_prema", "josgar01"],
  f3_shin: ["f3_hitech", "wooshi01"],
  f3_mclaughlin: ["f3_hitech", "fiomcl01"],
  f3_nakamura: ["f3_hitech", "jinnak01"],
  f3_escotto: ["f3_aix", "ricesc01"],
  f3_david: ["f3_aix", "yevdav01"],
  f3_barrichello: ["f3_aix", "ferbar01"],
  f3_lacorte: ["f3_dams", "niclar02"],
  f3_bhirombhakdi: ["f3_dams", "nanbhi01"],
  f3_xie: ["f3_dams", "gerxie01"],
};

function seriesOfTeam(teamId: string): SeriesId {
  return teamId.startsWith("f2_") ? "f2" : teamId.startsWith("f3_") ? "f3" : "f1";
}

/**
 * URL de la foto oficial de un piloto, o `null` si no hay (piloto inventado o sin foto publicada).
 * `head` recorta la cara con el servidor de imágenes; `full` es el retrato de cuerpo entero.
 */
export function driverPhotoUrl(driverId: string, kind: PhotoKind, size = 200): string | null {
  const entry = DRIVER_PHOTO[driverId];
  if (!entry) return null;
  const [teamId, code] = entry;
  const slug = TEAM_SLUG[teamId];
  const m = MEDIA[seriesOfTeam(teamId)];
  const t = kind === "head" ? `c_thumb,g_face,z_0.7,w_${size},h_${size}` : `c_lfill,w_${size}`;
  return `${m.base}/${t}/q_auto/${m.driverFallback}/${m.version}/${slug}/${code}/2026${slug}${code}right.webp`;
}

/** URL de la imagen oficial del coche de perfil, o `null` si el equipo no tiene. */
export function carPhotoUrl(teamId: string, height = 224): string | null {
  const slug = TEAM_SLUG[teamId];
  if (!slug) return null;
  const series = seriesOfTeam(teamId);
  const m = MEDIA[series];
  // F2 y F3 solo publican el coche visto desde la izquierda; la versión "right" es la genérica.
  const view = series === "f1" ? "right" : "left";
  return `${m.base}/c_lfill,h_${height}/q_auto/${m.carFallback}/${m.version}/${slug}/2026${slug}car${view}.webp`;
}
