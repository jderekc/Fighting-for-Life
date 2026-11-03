// The original 26x18 meadow, frozen as a fixture so geometry tests keep stable coordinates while the real level 1 evolves.
export const MEADOW_26X18 = {
  "id": 1,
  "name": "Meadow Brawl",
  "arena": {
    "width": 26,
    "depth": 18
  },
  "heroStart": {
    "x": 0,
    "z": 5
  },
  "scenery": {
    "streams": [
      {
        "ix": 0,
        "iz": 8,
        "w": 26,
        "d": 2
      }
    ],
    "bridges": [
      {
        "ix": 6,
        "iz": 8,
        "w": 2,
        "d": 2
      },
      {
        "ix": 18,
        "iz": 8,
        "w": 2,
        "d": 2
      }
    ],
    "buildings": [
      {
        "ix": 20,
        "iz": 11,
        "w": 5,
        "d": 5,
        "door": {
          "side": "S",
          "index": 2
        }
      }
    ],
    "trees": [
      [
        1,
        1
      ],
      [
        2,
        1
      ],
      [
        1,
        2
      ],
      [
        24,
        1
      ],
      [
        23,
        1
      ],
      [
        24,
        2
      ],
      [
        8,
        4
      ],
      [
        17,
        5
      ],
      [
        11,
        6
      ],
      [
        1,
        16
      ],
      [
        2,
        16
      ],
      [
        0,
        15
      ],
      [
        9,
        15
      ],
      [
        10,
        16
      ],
      [
        16,
        15
      ],
      [
        17,
        16
      ],
      [
        15,
        12
      ],
      [
        5,
        12
      ]
    ],
    "rocks": [
      [
        4,
        5
      ],
      [
        14,
        6
      ],
      [
        9,
        12
      ],
      [
        19,
        5
      ],
      [
        7,
        14
      ],
      [
        0,
        6
      ],
      [
        25,
        6
      ],
      [
        0,
        12
      ]
    ],
    "flowers": {
      "count": 40,
      "seed": 5
    }
  },
  "enemies": [
    {
      "type": "grunt",
      "x": -8,
      "z": -5,
      "delay": 1.5
    },
    {
      "type": "grunt",
      "x": 8,
      "z": -5,
      "delay": 1.5
    },
    {
      "type": "grunt",
      "x": -10,
      "z": -3,
      "delay": 12
    },
    {
      "type": "grunt",
      "x": 10,
      "z": -3,
      "delay": 12
    },
    {
      "type": "grunt",
      "x": 0,
      "z": -7,
      "delay": 14
    },
    {
      "type": "grunt",
      "x": -10,
      "z": -6,
      "delay": 26
    },
    {
      "type": "grunt",
      "x": 10,
      "z": -6,
      "delay": 26
    },
    {
      "type": "grunt",
      "x": -11,
      "z": 4,
      "delay": 28
    }
  ],
  "appleSpots": [
    {
      "x": -10,
      "z": 6
    },
    {
      "x": 0,
      "z": -6
    },
    {
      "x": 9.5,
      "z": 4.5
    }
  ]
};
