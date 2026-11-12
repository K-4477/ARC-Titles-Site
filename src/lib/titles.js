// Buffs, colours and icons for each title. Names must match the names in the database.
export const TITLE_META = {
  'Guardian of Harmony': { color: 'gold', icon: 'harmony', buff: '' },
  'Guardian of Water': { color: 'water', icon: 'water', buff: "+15% All Benders' recruitment speed" },
  'Guardian of Earth': { color: 'earth', icon: 'earth', buff: '+10% Construction\n+10% Research Speed' },
  'Guardian of Air': { color: 'air', icon: 'air', buff: '+20% All Resource Gathering Speed\n+20% All Resource Production' },
  'Guardian of Fire': { color: 'fire', icon: 'fire', buff: "+5% All benders' ATK\n +5% All benders' DEF" },
  Governor: { color: 'water', icon: 'governor', buff: "+10% All Benders' recruitment speed" },
  Architect: { color: 'earth', icon: 'architect', buff: '+10% Construction Speed' },
  Prefect: { color: 'mind', icon: 'prefect', buff: '+10% Research Speed' },
  General: { color: 'fire', icon: 'general', buff: "+5% All benders' ATK" }
};

export const TITLE_ORDER = Object.keys(TITLE_META);
export const MAX_HOURS = 2;

export const metaFor = (name) => TITLE_META[name] || { color: 'gold', icon: 'harmony', buff: '' };

export const sortTitles = (titles) =>
  [...titles].sort((a, b) => {
    const i = TITLE_ORDER.indexOf(a.name);
    const j = TITLE_ORDER.indexOf(b.name);
    return (i < 0 ? 99 : i) - (j < 0 ? 99 : j);
  });

export const isPermanent = (t) => t.is_permanent == 1 && !!t.holder;
