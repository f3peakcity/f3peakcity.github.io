# f3peakcity.com website ![Deploy Huge site to Pages](https://github.com/f3peakcity/f3peakcity.github.io/actions/workflows/hugo.yml/badge.svg?branch=main)

The F3 Peak City website site is built using Hugo and the [Beautiful Hugo theme](https://github.com/halogenica/beautifulhugo).

The site is published using GitHub pages, available at this URL: [https://f3peakcity.github.io/](https://f3peakcity.github.io/)

## Contributors

Pax with admin rights:
* Wahoo
* Clockwork

## Contributing

Depending on what you want to do, you have a few options to contribute.

| What you want to do | How to contribute |
| --- | --- |
| Update content on a page | Search this repo for what you want to update and open a pull request. |
| Add a new AO to the Q sheet | Contact Wahoo on Slack or open an issue. |
| Write a backblast | Right now, you can create a new file in the `/backblasts` folder and open a pull request. In the future, we hope to automate this from the Slack Paxmate. |
| Change the way the website looks or behaves | Open a pull request. You also probably want to build locally to test your changes (see the following **Quick start**). |

## Quick start

1. Clone the repo.
2. [Install Hugo](https://gohugo.io/installation/) version 0.104.2.
3. Navigate into the repo and run build the site locally.
   ```
   hugo server -D
   ```
4. Open [https://localhost:1313](https://localhost:1313) in your browser. The site will automatically refresh as you save changes to the locally cloned files.

## Differences from standard Hugo and theme


### Taxonomies

* Added `ao` and `pax` taxonomies so that we can organize the backblasts by these (instead of using terms like categories and tags)

### CSS

The `/static/css/main.css` file is mostly copied from the Beautiful Hugo repo. However, the `blog-AOs` and `blog-pax` properties were added to style the custom taxonomies for those.
