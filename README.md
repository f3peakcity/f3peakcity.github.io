# f3peakcity.com website ![Deploy Huge site to Pages](https://github.com/f3peakcity/f3peakcity.github.io/actions/workflows/hugo.yml/badge.svg?branch=main)

The F3 Peak City website site is built using Hugo and a fork of the [Beautiful Hugo theme](https://github.com/f3peakcity/beautifulhugo).

The site is published using GitHub pages, available at the following URLs:

- Production: [https://f3peakcity.com/](https://f3peakcity.com/)

## Contributors

Pax with admin rights:

- [Wahoo](https://github.com/mikeyrcamp)
- [Clockwork](https://github.com/artberger)

## Contributing

Depending on what you want to do, you have a few options to contribute.

| What you want to do                         | How to contribute                                                                                                                                         |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Update content on a page                    | Search this repo for what you want to update and open a pull request.                                                                                     |
| Add a new AO to the Q sheet                 | Contact Wahoo on Slack or open an issue.                                                                                                                  |
| Write a backblast                           | Right now, you can create a new file in the `/backblasts` folder and open a pull request. In the future, we hope to automate this from the Slack Paxmate. |
| Change the way the website looks or behaves | Open a pull request. You also probably want to build locally to test your changes (see the following **Quick start**).                                    |

## Quick start

1. Clone the repo.
2. [Install Hugo](https://gohugo.io/installation/) version 0.130.0.
3. Navigate into the repo and run build the site locally.
   ```
   hugo server -D
   ```
4. Open [https://localhost:1313](https://localhost:1313) in your browser. The site will automatically refresh as you save changes to the locally cloned files.

## Local changes to the theme

If you want to make styling changes such as CSS to the beautifulhugo forked theme, you have a couple options to test local changes:

- In the `config.toml` file, [add a replace section](https://gohugo.io/hugo-modules/use-modules/#make-and-test-changes-in-a-module) to point to your local clone of the forked repo. Then make your changes in that repo and refresh your Hugo server.
- Use `hugo mod vendor` to download a [local `_vendor` directory](https://gohugo.io/hugo-modules/use-modules/#vendor-your-modules) in this `f3peakcity.github.io` project. Then make your changes in that `_vendor` directory and refresh your Hugo server.

## Updating the theme

The [forked Beautiful Hugo theme](https://github.com/f3peakcity/beautifulhugo) is added as a [Hugo module](https://gohugo.io/hugo-modules/). The general process to update the theme is as follows.

1. Make your theme changes in the [forked repo](https://github.com/f3peakcity/beautifulhugo).
2. [Create a new release](https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository) for the theme changes. Naming convention is like `v0.0.1`.
3. Navigate to your clone of this repo and run `hugo mod get github.com/f3peakcity/beautifulhugo`.
4. Commit and push your changes.

## Differences from standard Hugo and this site

### Taxonomies

- Added `ao` and `pax` taxonomies so that we can organize the backblasts by these (instead of using terms like categories and tags)

## Updating/Adding AOs

To add or update an AO location make sure to update the following places.

1. Submit a [F3 Nation Map Change Request](https://f3nation.com/map-changes/).
2. Update the link on the [schedule](./content/schedule/index.md).
3. Update the links on the [Q Sheet](https://docs.google.com/spreadsheets/d/13aEBXExY-04Lq8cCtnqIeOhaxSDh0CGuUPY9vrYW8Io/edit?usp=sharing).
