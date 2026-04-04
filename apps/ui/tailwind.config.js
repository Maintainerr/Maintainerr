/* eslint-disable @typescript-eslint/no-require-imports */
const colors = require('tailwindcss/colors')
const defaultTheme = require('tailwindcss/defaultTheme')

const errorPalette = {
  50: '#fff4f2',
  100: '#f8d7d1',
  200: '#ebb2a8',
  300: '#d88b7e',
  400: '#bd6051',
  500: '#9d3a2d',
  600: '#7d2117',
  700: '#67160f',
  800: '#4b100c',
  900: '#310907',
  950: '#1e0403',
  DEFAULT: '#7d2117',
}

const successPalette = {
  50: '#f3fbf6',
  100: '#d9efe0',
  200: '#b7dcc4',
  300: '#8fc2a2',
  400: '#66977b',
  500: '#47745c',
  600: '#315b46',
  700: '#254637',
  800: '#193127',
  900: '#0f1f19',
  950: '#07110d',
  DEFAULT: '#315b46',
}

module.exports = {
  mode: 'jit',
  content: ['./src/pages/**/*.{ts,tsx}', './src/components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        error: errorPalette,
        success: successPalette,
        warning: colors.amber,
        info: colors.sky,
      },
      transitionProperty: {
        'max-height': 'max-height',
        width: 'width',
      },
      fontFamily: {
        sans: ['Inter', ...defaultTheme.fontFamily.sans],
      },
      screens: {
        xs: '440px',
      },
      typography: (theme) => ({
        DEFAULT: {
          css: {
            color: theme('colors.gray.300'),
            a: {
              color: theme('colors.indigo.500'),
              '&:hover': {
                color: theme('colors.indigo.400'),
              },
            },
            h1: {
              color: theme('colors.gray.300'),
            },
            h2: {
              color: theme('colors.gray.300'),
            },
            h3: {
              color: theme('colors.gray.300'),
            },
            h4: {
              color: theme('colors.gray.300'),
            },
            h5: {
              color: theme('colors.gray.300'),
            },
            h6: {
              color: theme('colors.gray.300'),
            },

            strong: {
              color: theme('colors.gray.400'),
            },

            code: {
              color: theme('colors.gray.300'),
            },

            figcaption: {
              color: theme('colors.gray.500'),
            },
          },
        },
      }),
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
    require('@tailwindcss/typography'),
    require('@tailwindcss/aspect-ratio'),
  ],
}
