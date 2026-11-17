// Verse of the Day library.

// ── FAITH PAGE ───────────────────────────────────────────────────────────────

// ── Verse of the Day Library ──────────────────────────────────────────────
// Scripture is NIV unless the reference names another translation (see Scripture Credits).
const VERSE_LIBRARY = [
  {v: "Trust in the Lord with all your heart, and do not lean on your own understanding.", r: "Proverbs 3:5 ESV"},
  {v: "I can do all things through Christ who strengthens me.", r: "Philippians 4:13 NKJV"},
  {v: "For God so loved the world that he gave his one and only Son.", r: "John 3:16"},
  {v: "Be still, and know that I am God.", r: "Psalm 46:10 KJV"},
  {v: "And we know that in all things God works for the good of those who love him.", r: "Romans 8:28"},
  {v: "The Lord is my shepherd; I shall not want.", r: "Psalm 23:1 KJV"},
  {v: "Wait on the Lord; be of good courage, and He shall strengthen your heart.", r: "Psalm 27:14 NKJV"},
  {v: "Do not be anxious about anything, but in every situation by prayer and petition present your requests to God.", r: "Philippians 4:6"},
  {v: "Cast all your anxiety on him because he cares for you.", r: "1 Peter 5:7"},
  {v: "Therefore do not worry about tomorrow, for tomorrow will worry about itself.", r: "Matthew 6:34"},
  {v: "Be strong and courageous. Do not be afraid; do not be discouraged, for the Lord your God will be with you wherever you go.", r: "Joshua 1:9"},
  {v: "The Lord will fight for you; you need only to be still.", r: "Exodus 14:14"},
  {v: "Come to me, all you who are weary and burdened, and I will give you rest.", r: "Matthew 11:28"},
  {v: "Greater love has no one than this: to lay down one's life for one's friends.", r: "John 15:13"},
  {v: "I have fought the good fight, I have finished the race, I have kept the faith.", r: "2 Timothy 4:7"},
  {v: "Above all else, guard your heart, for everything you do flows from it.", r: "Proverbs 4:23"},
  {v: "Commit to the Lord whatever you do, and he will establish your plans.", r: "Proverbs 16:3"},
  {v: "Many are the plans in a person's heart, but it is the Lord's purpose that prevails.", r: "Proverbs 19:21"},
  {v: "She is clothed with strength and dignity; she can laugh at the days to come.", r: "Proverbs 31:25"},
  {v: "In their hearts humans plan their course, but the Lord establishes their steps.", r: "Proverbs 16:9"},
  {v: "Train up a child in the way he should go; even when he is old he will not depart from it.", r: "Proverbs 22:6 ESV"},
  {v: "Two are better than one, because they have a good return for their labor.", r: "Ecclesiastes 4:9"},
  {v: "There is a time for everything, and a season for every activity under the heavens.", r: "Ecclesiastes 3:1"},
  {v: "Now faith is confidence in what we hope for and assurance about what we do not see.", r: "Hebrews 11:1"},
  {v: "Let us not become weary in doing good, for at the proper time we will reap a harvest if we do not give up.", r: "Galatians 6:9"},
  {v: "But seek first his kingdom and his righteousness, and all these things will be given to you as well.", r: "Matthew 6:33"},
  {v: "Where your treasure is, there your heart will be also.", r: "Matthew 6:21"},
  {v: "Whatever you do, work at it with all your heart, as working for the Lord, not for human masters.", r: "Colossians 3:23"},
  {v: "Be kind and compassionate to one another, forgiving each other, just as in Christ God forgave you.", r: "Ephesians 4:32"},
  {v: "Therefore, my beloved brothers, be steadfast, immovable, always abounding in the work of the Lord.", r: "1 Corinthians 15:58 ESV"},
  {v: "For I know the plans I have for you, declares the Lord, plans to prosper you and not to harm you.", r: "Jeremiah 29:11"},
]

function getVerseOfDay() {
  const dayOfYear = Math.floor((new Date() - new Date(new Date().getFullYear(), 0, 0)) / 86400000)
  return VERSE_LIBRARY[dayOfYear % VERSE_LIBRARY.length]
}

export { getVerseOfDay }
