---
title: Paxmate User Guide
date: 2023-01-16
author: Clockwork
tags: ["paxmate","site-q", "newsletter", "guide"]
bigimg: [{ src: "/img/articles/paxmate-banner.png" }]
---

Paxmate is inching ever-closer to the Singularity, and your intrepid correspondent wants to make sure that you have the training you need to stay one step ahead of Skynet. Please review the following user guides for the two tools that make up Paxmate: the Slack bot and dashboard.

| Paxmate tool | Where it is | Purpose |
| --- | --- | --- |
| [Slack bot](#slack-bot) | Type `/backblast` in a Slack channel | A tool to input data after an event, including a summary of the event and attendees. |
| [Dashboard](#dashboard) | The [website](/paxmate-dashboard) | A filterable dashboard to view stats such as how many times you post a week or how many guys on average your favorite AO gets. |

## Slack bot

Before you begin using the Paxmate Slack bot, you need a [Slack account](/slack).

1. Go to the channel where you want to record an event. Common channels include:
   * `#1stf` for all workouts, both at AOs or on-your-own.
   * `#2ndf` for social activities.
   * `#3rdf` for service activities.
2. Type `/backblast` in the message, and then click the **Send** button.
3. Fill out the Paxmate form. The form has several fields that are prepopulated to help you.
   * Select the date and Q of the event.
   * Select the AO by channel. `#1stf` events have channels for each AO in the format `#ao-day-name`, like `#ao-tue-dtp`. You do **NOT** need to duplicate a post in a different region like **Carpex** or **Green Level** in the Peak City slack, if you were already tagged in a backblast in that region's slack.
   * Select the Pax who posted. You can search them by name. They must be in Slack to appear in this list.
   * Provide a summary of the event.
   * Add any FNGs. For multiple FNGs, separate the names with a comma (`,`).
   * Add any additional Pax, such as ones who are not signed up in Slack. For multiple Pax, separate the names with a comma (`,`).
   * For Visiting Pax, you can enter a number. If you already entered them all in the additional Pax, skip this field.
4. Click **Submit**. You only have to do this once, even if it seems like it didn't work. Sometimes it takes a minute to process.

{{< figure src="/img/articles/paxmate-slack-bot-form.png" title="Example paxmate form" height="100" >}}

> Got ideas? To suggest changes or see what future enhancements we have in mind, see the [`f3_bot` issues](https://github.com/f3peakcity/f3_bot/issues).

## Dashboard

The [Paxmate dashboard](/paxmate-dashboard) can be found on this website.

**Why do I care?**

Because it's flashy and has numbers, duh! Who doesn't like to see his name on a chart or trend line?

More seriously, Site Qs might find this info useful. For example, you can find your AO and see which Pax attend the most and who hasn't Q'd in a while. These people might be good ones to ask to fill in a Q or even step up to Site Q when your term is done.

Another thing you can do is see who hasn't posted in awhile. Maybe you can reach out and see what's up!

**Info you can find**

There are 5 sections: Summary, Map, Weekly Trend, AO Rank, Pax Detail. They are ordered vertically so you can scroll on your phone easily.

**Filtering by date**

You can filter the dashboard by the Date Range or by Day.
To filter by Date Range, click the date box at the very top. A pop-out opens up, and you can either use the slider to change the date, or simply click and select the date by using the calendar.
To filter by Day, click one of the colored day tiles. To clear the filter, click the tile again.

**Using the charts**

On the AO Bar Chart Section, click the Bar to see a pop-up of the top 20 Pax for the AO. It also has a value for "Days Since last Q," which is for any Q, not specifically that site. To make the pop-up go away, click anywhere outside it.

On the Pax Detail table, you can interact in two ways:
* Click on a number in a Pax row and it will pull up their AO details and trend lines for posting
* Click on a column label and a pop-up will allow you to sort the table by that column, useful to find pax who haven't posted

**Tips and tricks**

* Avoid scrolling on the map itself; it will move and be weird.
* Similarly, scrolling in the details tables is a little janky, as both the dashboard and table itself scroll.

## Thank-you's

Huge shoutout to the Martha Stewart of Data (and Peruvian chicken recipes), **Pivot**, for pulling the Paxmate dashboard together.

Thanks to **Torpedo** for the initial set up of the `f3_bot` app, and to **Wahoo** for making it multi-regional.
