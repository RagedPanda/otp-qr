// Throwaway account labels such as "quiet-falcon-4821", for when the real name shouldn't go in the QR.

export const ADJECTIVES = Object.freeze([
  'amber', 'bold', 'brisk', 'calm', 'clever', 'cosmic', 'crisp', 'dapper', 'eager', 'fuzzy',
  'gentle', 'golden', 'hidden', 'jolly', 'lucky', 'lunar', 'mellow', 'misty', 'nimble', 'quiet',
  'rapid', 'silent', 'sunny', 'swift', 'tidy', 'velvet', 'vivid', 'wild', 'witty', 'zesty',
]);

export const ANIMALS = Object.freeze([
  'badger', 'beaver', 'bison', 'cobra', 'condor', 'coyote', 'falcon', 'ferret', 'gecko', 'heron',
  'ibis', 'jaguar', 'koala', 'lemur', 'lynx', 'marmot', 'moose', 'narwhal', 'ocelot', 'otter',
  'panda', 'puffin', 'quokka', 'raven', 'salmon', 'tapir', 'toucan', 'walrus', 'wombat', 'yak',
]);

/** `randomInt(limit)` returns an integer in [0, limit); inject it so the output is testable. */
export const randomAccountName = (randomInt) =>
  `${ADJECTIVES[randomInt(ADJECTIVES.length)]}-${ANIMALS[randomInt(ANIMALS.length)]}-${1000 + randomInt(9000)}`;
