# Paleta Xaveriana · USFX Virtual

Sistema de color oficial de la landing. Nace de los símbolos de la universidad:
el **azul** y el **rojo** de la bandera, el **oro** del escudo y el **marfil** de la piedra colonial.

Todas las combinaciones de texto y fondo cumplen **WCAG 2.1 AA** (4,5:1 para texto normal).

## Colores base

| Nombre | Hex | Uso |
|---|---|---|
| Azul Noche | `#0B1D3A` | Fondos oscuros: portada, secciones destacadas, pie |
| Azul Xaveriano | `#1E3A6E` | Color primario, enlaces, botones secundarios |
| Azul Hondo | `#12284E` | Degradados y tarjetas sobre fondo oscuro |
| Carmesí Chuquisaca | `#B01E2D` | Acción principal: botones "Preinscríbete", anuncios |
| Carmesí Hondo | `#8F1724` | Estado al pasar el cursor sobre botones carmesí |
| Oro Colonial | `#D4B062` | Acentos **solo sobre fondos oscuros**: etiquetas, íconos, cursivas |
| Oro Claro | `#E2C987` | Títulos en cursiva sobre azul noche |
| Oro Hondo | `#7A5B12` | Oro para texto **sobre fondos claros** |
| Marfil | `#F7F3EA` | Fondo claro principal |
| Blanco | `#FFFFFF` | Tarjetas y secciones alternas |
| Piedra | `#E4DCCB` | Bordes y líneas divisorias |
| Tinta | `#14213A` | Texto principal sobre fondos claros |
| Pizarra | `#4A5570` | Texto secundario sobre fondos claros |
| Niebla | `#C4CDDC` | Texto secundario sobre fondos oscuros |

## Combinaciones aprobadas (contraste medido)

| Texto | Fondo | Contraste |
|---|---|---|
| Tinta | Marfil | 14,5 : 1 |
| Pizarra | Marfil | 6,7 : 1 |
| Azul Xaveriano | Marfil | 10,1 : 1 |
| Carmesí | Marfil | 6,2 : 1 |
| Blanco | Carmesí | 6,8 : 1 |
| Blanco | Azul Noche | 16,8 : 1 |
| Niebla | Azul Noche | 10,5 : 1 |
| Oro Colonial | Azul Noche | 8,1 : 1 |
| Oro Colonial | Azul Xaveriano | 5,4 : 1 |
| Oro Hondo | Marfil | 5,7 : 1 |

## Reglas

1. **Una sola acción en carmesí por pantalla.** El carmesí llama a preinscribirse; no se usa para decorar.
2. **El oro nunca va sobre fondo claro** (se pierde). Sobre marfil o blanco, usa Oro Hondo.
3. **Sin rosados, morados ni degradados de muchos colores.** La firma visual es azul + carmesí, lado a lado.
4. **Texto sobre fotos** siempre con velo de Azul Noche debajo (mínimo 70 % de opacidad detrás del texto).
5. **Colores por carrera**, solo para identificar cada carrera (texto blanco encima, todos ≥ 5,7 : 1):

| Carrera | Hex |
|---|---|
| Derecho | `#1E3A6E` |
| Psicología | `#5A3A86` |
| Gerencia y Administración Pública | `#9A5518` |
| Ingeniería de Sistemas | `#1D6489` |
| Contaduría Pública | `#A12B2B` |
| Filosofía | `#7A1F33` |

## Tipografía que acompaña

- **Títulos:** Cormorant Garamond (500), con cursiva para el énfasis.
- **Texto:** Manrope (400–700).
- **Números:** siempre de altura uniforme (`lining-nums`).

Los valores viven como variables CSS en `src/landing/landing.css` (bloque «PALETA XAVERIANA»).
