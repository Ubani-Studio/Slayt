export const DEFAULT_YOUTUBE_DESCRIPTION_TEMPLATE = `{artist} - {title}
{featuring}

From the {collection} collection.

Listen / follow:
{links}

Credits:
{credits}

{cta}`;

export const YOUTUBE_DESCRIPTION_TEMPLATE_PLACEHOLDERS = [
  '{artist}',
  '{title}',
  '{featuring}',
  '{collection}',
  '{links}',
  '{credits}',
  '{cta}',
];

const collapseLines = (value = '') =>
  String(value || '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

const normalizeNames = (values = []) =>
  [...new Set(
    (Array.isArray(values) ? values : [values])
      .flatMap((value) => String(value || '').split(','))
      .map((value) => value.trim())
      .filter(Boolean)
  )];

export const getCollectionDescriptionTemplate = (collection = null) => {
  const rawTemplate = typeof collection?.descriptionTemplate === 'string'
    ? collection.descriptionTemplate
    : '';

  return rawTemplate.trim() || DEFAULT_YOUTUBE_DESCRIPTION_TEMPLATE;
};

export const renderYoutubeDescriptionTemplate = ({
  template = DEFAULT_YOUTUBE_DESCRIPTION_TEMPLATE,
  title = '',
  artistName = '',
  featuringArtists = [],
  collectionName = '',
  links = 'Add your links here',
  credits = 'Add credits here',
  cta = 'Subscribe for more.',
} = {}) => {
  const names = normalizeNames(featuringArtists);
  const replacements = {
    '{artist}': String(artistName || '').trim(),
    '{title}': String(title || '').trim(),
    '{featuring}': names.length > 0 ? `Featuring: ${names.join(', ')}` : '',
    '{collection}': String(collectionName || '').trim(),
    '{links}': String(links || '').trim() || 'Add your links here',
    '{credits}': String(credits || '').trim() || 'Add credits here',
    '{cta}': String(cta || '').trim() || 'Subscribe for more.',
  };

  let output = String(template || DEFAULT_YOUTUBE_DESCRIPTION_TEMPLATE);
  Object.entries(replacements).forEach(([placeholder, value]) => {
    output = output.split(placeholder).join(value);
  });

  return collapseLines(output);
};
