/**
 * Properties of a clip template on a DB graph. A DB graph does not read
 * `key:: value` in a block's text, so a property line the template wrote
 * (`TemplateProperty`, see src/utils/block-meta.ts) is set as a real property:
 * the user's own property of that title (any case), or a new one of the user
 * with the type the value suggests. Probed on 2.0.2:
 *
 * - A bare name (`upsertBlockProperty(uuid, 'source', v)`) makes a property of
 *   the plugin, even when the user has one of that title: always the ident.
 * - `upsertNodes` makes a property of the user and answers only a text; it
 *   makes a second one of the same title, so look first.
 * - The value is checked against the type: a url must be a URL, a number a
 *   number, a checkbox a boolean, a date the id of a journal page (or its
 *   title), a datetime epoch ms, text (default) a string.
 *
 * A value that does not fit the type of the user's property keeps its line
 * as text in the block: the clip never fails for a property.
 */
import log from '@/utils/logger';
import { isUrl, type TemplateProperty } from '@/utils/block-meta';
import type LogseqClient from './client';
import { t } from '@/i18n/core';

/** A property of the user, as getAllProperties lists it. */
export interface UserProperty {
  ident: string;
  title: string;
  type: string;
}

const USER_PROPERTY = ':user.property/';

/** The user's own properties: not built-in, not a plugin's. */
export const userProperties = async (
  client: Pick<LogseqClient, 'getAllProperties'>,
): Promise<UserProperty[]> => {
  const all = await client.getAllProperties();
  if (!Array.isArray(all)) {
    throw new Error(
      all && typeof all === 'object' && 'error' in all
        ? String((all as any).error)
        : t('background.logseq.noProperties'),
    );
  }
  return all.flatMap((property: any) => {
    const ident = property?.ident;
    const title = property?.title;
    if (typeof ident !== 'string' || !ident.startsWith(USER_PROPERTY)) return [];
    if (typeof title !== 'string' || !title.trim()) return [];
    const type = property[':logseq.property/type'];
    return [{ ident, title, type: typeof type === 'string' ? type : 'default' }];
  });
};

/**
 * The value of `property` for a property of `type`. `journalId` gives the db
 * id of the journal page the clip's date names.
 */
export const coerceValue = async (
  type: string,
  property: TemplateProperty,
  journalId: (title: string) => Promise<number | undefined>,
): Promise<unknown | undefined> => {
  const value = property.value;
  switch (type) {
    case 'default':
      return value;
    case 'url':
      return isUrl(value) ? value : undefined;
    case 'number': {
      if (!/^-?\d+(?:\.\d+)?$/.test(value)) return undefined;
      return Number(value);
    }
    case 'checkbox': {
      const lower = value.toLowerCase();
      return lower === 'true' ? true : lower === 'false' ? false : undefined;
    }
    case 'date':
      return property.date ? await journalId(property.date) : undefined;
    default:
      // datetime, node, page, ...: nothing a template line says fits them.
      return undefined;
  }
};

/** A property of a block the clip sets: by ident, with its value. */
export interface PropertyWrite {
  ident: string;
  value: unknown;
}

/**
 * Resolves the properties of the clip's blocks, the graph read once per
 * clip. `plan` answers which lines of a block become properties.
 */
export const createPropertyPlanner = (
  client: Pick<LogseqClient, 'getAllProperties' | 'createProperty' | 'getPage' | 'createJournalPage'>,
) => {
  let known: Promise<UserProperty[]> | undefined;
  const creating = new Map<string, Promise<UserProperty | undefined>>();
  const journals = new Map<string, Promise<number | undefined>>();

  const list = () => (known ??= userProperties(client));

  const find = async (title: string) => {
    const wanted = title.toLowerCase();
    return (await list()).find((p) => p.title.toLowerCase() === wanted);
  };

  const create = (title: string, type: string) => {
    const key = title.toLowerCase();
    if (!creating.has(key)) {
      creating.set(
        key,
        (async () => {
          await client.createProperty(title, type);
          known = undefined;
          return await find(title);
        })(),
      );
    }
    return creating.get(key)!;
  };

  const journalId = (title: string) => {
    if (!journals.has(title)) {
      journals.set(
        title,
        (async () => {
          const page: any =
            (await client.getPage({ name: title })) ??
            (await client.createJournalPage(title));
          return typeof page?.id === 'number' ? page.id : undefined;
        })(),
      );
    }
    return journals.get(title)!;
  };

  /**
   * The property to set for a line, or undefined to keep the line as text.
   * Never throws.
   */
  const resolve = async (
    property: TemplateProperty,
  ): Promise<PropertyWrite | undefined> => {
    try {
      const existing = await find(property.key);
      const target =
        existing ?? (await create(property.key, property.kind));
      if (!target) {
        log.warn(`The property ${property.key} could not be made; its line stays text.`);
        return undefined;
      }
      const value = await coerceValue(target.type, property, journalId);
      if (value === undefined) {
        log.warn(
          `The value of ${property.key} is not a ${target.type}; its line stays text.`,
        );
        return undefined;
      }
      return { ident: target.ident, value };
    } catch (error) {
      log.warn(`The property ${property.key} was not set; its line stays text.`, error);
      return undefined;
    }
  };

  return { resolve };
};
