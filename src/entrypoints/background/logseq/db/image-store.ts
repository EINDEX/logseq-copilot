import { assertStorableImage, type AssetRef, type ImageAssetStore, type ImageFile } from '../image-assets';

/*
 * Images in the assets of a DB graph, made the way Logseq makes a pasted one
 * (frontend.handler.editor.assets): the file is `assets/<uuid>.<ext>`, and an
 * Asset node with that uuid, under the Asset tag, has its type, size and
 * SHA-256 checksum. Another block shows it as `[[uuid]]`. Internal APIs,
 * probed on Logseq 2.0.2: `write_assetsdir_file` writes bytes given as
 * `{ type: 'Buffer', data: [...] }`, `import_edn` creates the node.
 */

/**
 * The API server takes a request body of 1 MiB at most (413 above it). The
 * bytes go as a JSON array of numbers, up to 3.6 characters per byte.
 */
export const MAX_REQUEST_BODY = 1_000_000;
export const DB_GRAPH_IMAGE_LIMIT = 270_000;

/** What the store needs of the DB graph client. */
export interface DbGraphAssetClient {
  writeAssetsdirFile(file: string, bytes: Uint8Array): Promise<string>;
  importEdn(transit: string): Promise<void>;
  /** A query that finds one uuid, or nothing. */
  queryUuid(query: string): Promise<string | undefined>;
  getBlockViaUuid(uuid: string): Promise<any>;
}

const ASSET_CLASS_QUERY =
  '[:find ?u . :where [?e :db/ident :logseq.class/Asset] [?e :block/uuid ?u]]';

const checksumQuery = (checksum: string) =>
  `[:find ?u . :where [?e :logseq.property.asset/checksum "${checksum}"] [?e :block/uuid ?u]]`;

const sha256 = async (bytes: Uint8Array) =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as BufferSource))]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

/** A string in transit JSON: one that starts with a transit mark is escaped. */
const transitString = (text: string) => (/^[~^`]/.test(text) ? `~${text}` : text);

/**
 * The title of the Asset node: the alt text, without what a DB graph could
 * read as a reference or tag, else the file name.
 */
export const assetTitle = (title: string, image: ImageFile) =>
  title
    .replace(/[[\]#(){}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100) || image.name;

/** The EDN (as transit JSON) that makes the Asset node below the Asset tag. */
export const assetEdn = (asset: {
  classUuid: string;
  uuid: string;
  title: string;
  ext: string;
  size: number;
  checksum: string;
}) =>
  JSON.stringify([
    '^ ',
    '~:pages-and-blocks',
    [
      [
        '^ ',
        '~:page',
        ['^ ', '~:block/uuid', `~u${asset.classUuid}`],
        '~:blocks',
        [
          [
            '^ ',
            '~:block/title',
            transitString(asset.title),
            '~:block/uuid',
            `~u${asset.uuid}`,
            '~:build/keep-uuid?',
            true,
            '~:build/tags',
            ['~:logseq.class/Asset'],
            '~:build/properties',
            [
              '^ ',
              '~:logseq.property.asset/type',
              transitString(asset.ext),
              '~:logseq.property.asset/size',
              asset.size,
              '~:logseq.property.asset/checksum',
              asset.checksum,
            ],
          ],
        ],
      ],
    ],
  ]);

/** Stores images as Asset nodes of a DB graph. */
export const createDbImageStore = (client: DbGraphAssetClient): ImageAssetStore => ({
  imageAssetLimit: DB_GRAPH_IMAGE_LIMIT,
  saveImageAsset: async (image: ImageFile, title: string): Promise<AssetRef> => {
    assertStorableImage(image);
    const checksum = await sha256(image.bytes);
    // Logseq keeps one Asset per file: a second paste of it is refused.
    const existing = await client.queryUuid(checksumQuery(checksum));
    if (existing) return { kind: 'ref', uuid: existing };

    const uuid = crypto.randomUUID();
    const file = `${uuid}.${image.ext}`;
    const body = JSON.stringify({
      method: 'logseq.App.write_assetsdir_file',
      args: [file, { type: 'Buffer', data: Array.from(image.bytes) }, ''],
    });
    if (body.length > MAX_REQUEST_BODY) throw new Error('The image is too large.');

    const classUuid = await client.queryUuid(ASSET_CLASS_QUERY);
    if (!classUuid) throw new Error('The graph has no Asset tag.');
    await client.writeAssetsdirFile(file, image.bytes);
    await client.importEdn(
      assetEdn({
        classUuid,
        uuid,
        title: assetTitle(title, image),
        ext: image.ext,
        size: image.bytes.length,
        checksum,
      }),
    );
    const node = await client.getBlockViaUuid(uuid);
    if (!node?.uuid || node.uuid !== uuid) throw new Error('Logseq did not make the Asset.');
    return { kind: 'ref', uuid };
  },
});
