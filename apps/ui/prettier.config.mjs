/**
 * @see https://prettier.io/docs/en/configuration.html
 * @type {import("prettier").Config}
 */
const config = {
  singleQuote: true,
  semi: false,
  tailwindStylesheet: './styles/globals.css',
  plugins: ['prettier-plugin-tailwindcss'],
}

export default config
