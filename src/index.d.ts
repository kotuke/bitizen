export type Pixel = readonly [column: number, row: number];
export type AvatarFormat = "svg" | "png";
export type AvatarStyle = "plain" | "rich";

/** One color of the figure and the modules painted with it. Layers never overlap. */
export interface AvatarLayer {
  readonly color: string;
  readonly pixels: readonly Pixel[];
}

interface CommonDescriptor {
  readonly version: string;
  readonly fingerprint: string;
  /** Base color taken from PALETTE. */
  readonly accent: string;
  /** The pair of eyes: always white, drawn on top of the figure. */
  readonly eyes: readonly [Pixel, Pixel];
  /** Figure height in modules. */
  readonly rows: number;
}

/** Style plain: a single-color mirrored figure on a grid background. */
export interface PlainDescriptor extends CommonDescriptor {
  readonly style: "plain";
  readonly pixels: readonly Pixel[];
}

/** Style rich: body cutouts, a second color, optional asymmetry, plain black background. */
export interface RichDescriptor extends CommonDescriptor {
  readonly style: "rich";
  /** Color scheme: 0 is mono, 1…4 are two-color. */
  readonly scheme: number;
  readonly layers: readonly AvatarLayer[];
  /** Column bounds of the figure: it may be asymmetric. */
  readonly columns: readonly [min: number, max: number];
}

export type AvatarDescriptor = PlainDescriptor | RichDescriptor;

export interface AvatarOptions {
  secret: string;
  style?: AvatarStyle;
  size?: number;
  title?: string;
}

export interface RenderOptions {
  size?: number;
  title?: string;
}

export const AVATAR_VERSION: string;
export const DEFAULT_SIZE: number;
export const MIN_SIZE: number;
export const MAX_SIZE: number;
export const PALETTE: readonly string[];
export const STYLE_NAMES: readonly AvatarStyle[];
export const DEFAULT_STYLE: AvatarStyle;

export function normalizeSize(value?: number | string): number;
export function normalizeStyle(value?: string): AvatarStyle;
export function createAvatarDescriptor(
  userId: string,
  options: Pick<AvatarOptions, "secret" | "style">,
): AvatarDescriptor;
export function assertAvatarDescriptor(descriptor: AvatarDescriptor): AvatarDescriptor;
export function renderAvatarSvg(descriptor: AvatarDescriptor, options?: RenderOptions): string;
export function generateAvatarSvg(userId: string, options: AvatarOptions): string;
export function renderAvatarPng(
  descriptor: AvatarDescriptor,
  options?: Pick<RenderOptions, "size">,
): Buffer;
export function generateAvatarPng(
  userId: string,
  options: Pick<AvatarOptions, "secret" | "style" | "size">,
): Buffer;
export function avatarEtag(
  descriptor: AvatarDescriptor,
  format: AvatarFormat,
  size: number,
): string;
