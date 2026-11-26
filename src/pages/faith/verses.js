// Verse of the Day library.

// ── FAITH PAGE ───────────────────────────────────────────────────────────────

// ── Verse of the Day Library ──────────────────────────────────────────────
// Scripture is from the Berean Standard Bible (BSB), which is in the public domain (see Scripture Credits).
const VERSE_LIBRARY = [
  {v: "Trust in the LORD with all your heart, and lean not on your own understanding.", r: "Proverbs 3:5"},
  {v: "I can do all things through Christ who gives me strength.", r: "Philippians 4:13"},
  {v: "For God so loved the world that He gave His one and only Son, that everyone who believes in Him shall not perish but have eternal life.", r: "John 3:16"},
  {v: "Be still and know that I am God.", r: "Psalm 46:10"},
  {v: "And we know that God works all things together for the good of those who love Him, who are called according to His purpose.", r: "Romans 8:28"},
  {v: "The LORD is my shepherd; I shall not want.", r: "Psalm 23:1"},
  {v: "Wait patiently for the LORD; be strong and courageous. Wait patiently for the LORD!", r: "Psalm 27:14"},
  {v: "Be anxious for nothing, but in everything, by prayer and petition, with thanksgiving, present your requests to God.", r: "Philippians 4:6"},
  {v: "Cast all your anxiety on Him, because He cares for you.", r: "1 Peter 5:7"},
  {v: "Therefore do not worry about tomorrow, for tomorrow will worry about itself. Today has enough trouble of its own.", r: "Matthew 6:34"},
  {v: "Do not be afraid; do not be discouraged, for the LORD your God is with you wherever you go.", r: "Joshua 1:9"},
  {v: "The LORD will fight for you; you need only to be still.", r: "Exodus 14:14"},
  {v: "Come to Me, all you who are weary and burdened, and I will give you rest.", r: "Matthew 11:28"},
  {v: "Greater love has no one than this, that he lay down his life for his friends.", r: "John 15:13"},
  {v: "I have fought the good fight, I have finished the race, I have kept the faith.", r: "2 Timothy 4:7"},
  {v: "Guard your heart with all diligence, for from it flow springs of life.", r: "Proverbs 4:23"},
  {v: "Commit your works to the LORD and your plans will be achieved.", r: "Proverbs 16:3"},
  {v: "Many plans are in a man's heart, but the purpose of the LORD will prevail.", r: "Proverbs 19:21"},
  {v: "Strength and honor are her clothing, and she can laugh at the days to come.", r: "Proverbs 31:25"},
  {v: "A man's heart plans his course, but the LORD determines his steps.", r: "Proverbs 16:9"},
  {v: "Train up a child in the way he should go, and when he is old he will not depart from it.", r: "Proverbs 22:6"},
  {v: "Two are better than one, because they have a good return for their labor.", r: "Ecclesiastes 4:9"},
  {v: "To everything there is a season, and a time for every purpose under heaven.", r: "Ecclesiastes 3:1"},
  {v: "Now faith is the assurance of what we hope for and the certainty of what we do not see.", r: "Hebrews 11:1"},
  {v: "Let us not grow weary in well-doing, for in due time we will reap a harvest if we do not give up.", r: "Galatians 6:9"},
  {v: "But seek first the kingdom of God and His righteousness, and all these things will be added unto you.", r: "Matthew 6:33"},
  {v: "For where your treasure is, there your heart will be also.", r: "Matthew 6:21"},
  {v: "Whatever you do, work at it with your whole being, as for the Lord and not for men.", r: "Colossians 3:23"},
  {v: "Be kind and tenderhearted to one another, forgiving each other just as in Christ God forgave you.", r: "Ephesians 4:32"},
  {v: "Therefore, my beloved brothers, be steadfast and immovable. Always excel in the work of the Lord, because you know that your labor in the Lord is not in vain.", r: "1 Corinthians 15:58"},
  {v: "For I know the plans I have for you, declares the LORD, plans to prosper you and not to harm you, to give you a future and a hope.", r: "Jeremiah 29:11"},
]

function getVerseOfDay() {
  const dayOfYear = Math.floor((new Date() - new Date(new Date().getFullYear(), 0, 0)) / 86400000)
  return VERSE_LIBRARY[dayOfYear % VERSE_LIBRARY.length]
}

export { getVerseOfDay }
