// Grupos musculares: nombre, color y una adivinanza rápida por palabras clave (antes de preguntarle a la IA).
import { norm } from "./format.js";

export const CATS=[["piernas","Piernas","#2E9BD6"],["gluteos","Glúteos","#D6457A"],["espalda","Espalda","#15985C"],["pecho","Pecho","#C98A00"],["hombros","Hombros","#8E6BE8"],["brazos","Brazos","#E07A3F"],["core","Core","#0E8C7E"],["cardio","Cardio","#E0485F"],["otro","Otro","#8B93A6"]];
export const CATMAP=Object.fromEntries(CATS.map(c=>[c[0],c]));
export function guessCat(n){
  const t=norm(n),h=(...w)=>w.some(x=>t.includes(x));
  if(h("ergometro","trote","correr","bici","eliptica","cinta","caminadora","cuerda","burpee","spinning","assault","remoerg"))return "cardio";
  if(h("femoral","isquio","cuadricep","sentadilla","prensa","zancada","estocada","extension de pierna","extension de cuadri","gemelo","pantorrilla","peso muerto","bulgara","step up","pierna"))return "piernas";
  if(h("plancha","abdominal","crunch","core","oblicuo","rueda","hollow","dead bug","bear","oso","pallof","russian","elevacion de piernas"))return "core";
  if(h("gluteo","hip thrust","puente","patada","abduc"))return "gluteos";
  if(h("militar","hombro","lateral","vuelo","face pull","arnold","deltoid","pajaro"))return "hombros";
  if(h("banca","pecho","apertura","flexion","pec deck","cruce","press inclinado","press declinado"))return "pecho";
  if(h("remo","jalon","dominada","pull","lumbar","espalda","pullover","encogimiento"))return "espalda";
  if(h("curl","bicep","tricep","fondos","martillo","frances","copa"))return "brazos";
  return null;
}
