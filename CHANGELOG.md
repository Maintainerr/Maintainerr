# [2.22.0](https://github.com/maintainerr/Maintainerr/compare/v2.21.0...v2.22.0) (2025-11-29)


### Bug Fixes

* BASE_PATH support ([#2052](https://github.com/maintainerr/Maintainerr/issues/2052)) ([f0a2410](https://github.com/maintainerr/Maintainerr/commit/f0a24100f196fe2cfd844cb5335b9959234ca1c6))
* Improve language for rule options & hide irrelevant ones ([#2097](https://github.com/maintainerr/Maintainerr/issues/2097)) ([91f3173](https://github.com/maintainerr/Maintainerr/commit/91f31730bc222b9ce61a92dba578f5855086c8ac))
* Radarr import list exclusions missing for unmonitor actions ([#2098](https://github.com/maintainerr/Maintainerr/issues/2098)) ([05bd94c](https://github.com/maintainerr/Maintainerr/commit/05bd94cc379b112a58bfd97d4abac451b501bf9b))
* Rule Group Active input not linked to label ([#2101](https://github.com/maintainerr/Maintainerr/issues/2101)) ([95196f4](https://github.com/maintainerr/Maintainerr/commit/95196f400225af7ac8ddd3420ca1fc31c84c6722))


### Features

* Serve UI statically from API ([#2044](https://github.com/maintainerr/Maintainerr/issues/2044)) ([dbd93fc](https://github.com/maintainerr/Maintainerr/commit/dbd93fcc92e5bd7264b6ecd808da88f101f4144e))

# [2.21.0](https://github.com/maintainerr/Maintainerr/compare/v2.20.0...v2.21.0) (2025-11-16)


### Bug Fixes

* Always get fresh Plex collection children when syncing ([#2009](https://github.com/maintainerr/Maintainerr/issues/2009)) ([c8f1770](https://github.com/maintainerr/Maintainerr/commit/c8f1770018e02c807076f7790cf7be2152dcf0e1)), closes [#1705](https://github.com/maintainerr/Maintainerr/issues/1705)
* Clear Plex authentication throwing error ([#2035](https://github.com/maintainerr/Maintainerr/issues/2035)) ([81dd149](https://github.com/maintainerr/Maintainerr/commit/81dd149b0ff616f7e38898a14c36a775fe43cc73))
* Collection info loader using incorrect colspan ([0618fe7](https://github.com/maintainerr/Maintainerr/commit/0618fe72f42cd35ad530269c66c72f86af1160f1))
* Collection Plex ID not being reset in rare circumstances ([#2010](https://github.com/maintainerr/Maintainerr/issues/2010)) ([fae3df5](https://github.com/maintainerr/Maintainerr/commit/fae3df5cb3e0fafc802444e5639f869fad0aa470))
* ES Module import error for octokit packages ([#2012](https://github.com/maintainerr/Maintainerr/issues/2012)) ([efa35c6](https://github.com/maintainerr/Maintainerr/commit/efa35c68ae2c984a6509f67d09dd3f77bba45891))
* Improve notification msg when Plex item non-existent ([#1998](https://github.com/maintainerr/Maintainerr/issues/1998)) ([b86cf79](https://github.com/maintainerr/Maintainerr/commit/b86cf799f107a7221699f862af954fc0240f7643))
* Improve promise usage ([#2004](https://github.com/maintainerr/Maintainerr/issues/2004)) ([ae11068](https://github.com/maintainerr/Maintainerr/commit/ae11068a97b17c24c7d22abba544533fb7420285))
* prevent media modal from opening on global exclusion removal confirmation ([#2008](https://github.com/maintainerr/Maintainerr/issues/2008)) ([b45bcec](https://github.com/maintainerr/Maintainerr/commit/b45bcec19eb74ac4263d83a9113c0ce30f180ce9))
* Remove erroneous whitespace in notification message ([#2015](https://github.com/maintainerr/Maintainerr/issues/2015)) ([afbc273](https://github.com/maintainerr/Maintainerr/commit/afbc27362f31282f66d2441fa39befa16ae7ba4e))
* Respect GitHub API rate limits ([#2007](https://github.com/maintainerr/Maintainerr/issues/2007)) ([ade0469](https://github.com/maintainerr/Maintainerr/commit/ade04690fe492953b5aaeebcb8fb18aafaf78f29))
* Take action after days not resetting back to default ([#2017](https://github.com/maintainerr/Maintainerr/issues/2017)) ([232687b](https://github.com/maintainerr/Maintainerr/commit/232687b6e1026a0435889d2df480f99e64b99522))
* Wrap media title in quotes in reminder notification ([#2016](https://github.com/maintainerr/Maintainerr/issues/2016)) ([a755c94](https://github.com/maintainerr/Maintainerr/commit/a755c94748bd97c3784f2a736918d31307b917f0))


### Features

* Disallow crawlers in robots.txt ([#2042](https://github.com/maintainerr/Maintainerr/issues/2042)) ([99f4c61](https://github.com/maintainerr/Maintainerr/commit/99f4c61929d4ee3b1eed522867a8410e1af10db9))
* Reduce Docker image size by 40%~ ([#2018](https://github.com/maintainerr/Maintainerr/issues/2018)) ([e157805](https://github.com/maintainerr/Maintainerr/commit/e1578055acefc5e787889b6ac7534d4250d1823a))
* Upgrade Node.js from v20 to v24 ([#2021](https://github.com/maintainerr/Maintainerr/issues/2021)) ([5bdc189](https://github.com/maintainerr/Maintainerr/commit/5bdc189ad4b635f34c35600f4efd417bbefa4328))

# [2.20.0](https://github.com/maintainerr/Maintainerr/compare/v2.19.0...v2.20.0) (2025-10-27)


### Bug Fixes

* Improve email rendering ([#1968](https://github.com/maintainerr/Maintainerr/issues/1968)) ([f2cfcb9](https://github.com/maintainerr/Maintainerr/commit/f2cfcb90be2b77247c47b33acf4407d404163843))


### Features

* Add Sonarr & Radarr audio languages rule options ([#1886](https://github.com/maintainerr/Maintainerr/issues/1886)) ([60f1756](https://github.com/maintainerr/Maintainerr/commit/60f1756963236e74f3ca8a47868268080f609220))

# [2.19.0](https://github.com/jorenn92/Maintainerr/compare/v2.18.2...v2.19.0) (2025-08-17)


### Features

* add comprehensive Copilot instructions ([#1888](https://github.com/jorenn92/Maintainerr/issues/1888)) ([5053168](https://github.com/jorenn92/Maintainerr/commit/5053168d532a52c141899373c0ed6fa7afe45e2d))
* Improve Jellyseerr settings UX ([#1872](https://github.com/jorenn92/Maintainerr/issues/1872)) ([2c7e7c3](https://github.com/jorenn92/Maintainerr/commit/2c7e7c300dfc9e031db306f90a80a39e28ef53d8))
* Improve Overseerr settings UX ([#1871](https://github.com/jorenn92/Maintainerr/issues/1871)) ([0c484fb](https://github.com/jorenn92/Maintainerr/commit/0c484fbbabf0e127b3cc189c8a7d6b84428178f1))

## [2.18.2](https://github.com/jorenn92/Maintainerr/compare/v2.18.1...v2.18.2) (2025-07-12)


### Bug Fixes

* ensuring correct application during connection test ([#1849](https://github.com/jorenn92/Maintainerr/issues/1849)) ([363661d](https://github.com/jorenn92/Maintainerr/commit/363661dc34b959579fda86aeb17606bff125cbbd))

## [2.18.1](https://github.com/jorenn92/Maintainerr/compare/v2.18.0...v2.18.1) (2025-06-19)


### Bug Fixes

* **notifications:** Missing email templates ([#1834](https://github.com/jorenn92/Maintainerr/issues/1834)) ([f3a09d1](https://github.com/jorenn92/Maintainerr/commit/f3a09d12769e210e63fc89ed034d9dd873e2e32e))
* Patch remaining runtime and cleanup issues ([#1813](https://github.com/jorenn92/Maintainerr/issues/1813)) ([d5bec2e](https://github.com/jorenn92/Maintainerr/commit/d5bec2e2ba13ecebfb5b1dc7d9029c33071e5269))

# [2.18.0](https://github.com/jorenn92/Maintainerr/compare/v2.17.0...v2.18.0) (2025-06-13)


### Bug Fixes

* Hide days in notifications for Do nothing rules ([#1788](https://github.com/jorenn92/Maintainerr/issues/1788)) ([d590220](https://github.com/jorenn92/Maintainerr/commit/d590220a94806100fa0b9e140f0382fa94fd08ff))
* Improve community rule loading states ([#1810](https://github.com/jorenn92/Maintainerr/issues/1810)) ([17691f4](https://github.com/jorenn92/Maintainerr/commit/17691f44607b10b8915ecbd92657bc2080eff6db))
* Improve UI memory handling ([#1808](https://github.com/jorenn92/Maintainerr/issues/1808)) ([ec110b9](https://github.com/jorenn92/Maintainerr/commit/ec110b9116606a29726cce14abb63589acfed84f))
* Media About To Be Handled notifications not sending ([#1801](https://github.com/jorenn92/Maintainerr/issues/1801)) ([1ef0346](https://github.com/jorenn92/Maintainerr/commit/1ef0346b1304e6ffcb416e1dceb78596a0d98fa5))
* Notification selected types, agent checkbox options ([#1791](https://github.com/jorenn92/Maintainerr/issues/1791)) ([b43066a](https://github.com/jorenn92/Maintainerr/commit/b43066a5c35cd61f740f61211c435e6e569b3055))
* **notifications:** Subject missing breaking some agents ([#1812](https://github.com/jorenn92/Maintainerr/issues/1812)) ([0d283de](https://github.com/jorenn92/Maintainerr/commit/0d283de710b14ccae33f6e2d332d8a914091d401))


### Features

* **rules:** add new CONTAINS_ALL action for complete subset validation ([#1825](https://github.com/jorenn92/Maintainerr/issues/1825)) ([67d85dd](https://github.com/jorenn92/Maintainerr/commit/67d85ddd23297527d56e67f6dd51ed2319745326))

# [2.17.0](https://github.com/jorenn92/Maintainerr/compare/v2.16.0...v2.17.0) (2025-05-29)


### Bug Fixes

* Incorrect sectionResults operator ([#1805](https://github.com/jorenn92/Maintainerr/issues/1805)) ([4c97819](https://github.com/jorenn92/Maintainerr/commit/4c97819ae31f807425b497fbcb96941168b3c398))
* prepend missing basePath occurences ([#1806](https://github.com/jorenn92/Maintainerr/issues/1806)) ([3e13645](https://github.com/jorenn92/Maintainerr/commit/3e13645fa505ad81a7b9cbbbe8627c82fdcc0d24))
* Prevent undefined base path appearing in path ([#1807](https://github.com/jorenn92/Maintainerr/issues/1807)) ([e8b8815](https://github.com/jorenn92/Maintainerr/commit/e8b8815ec40abff0e07f21672f938526a82ef51b))


### Features

* Add additional *arr quality profile rules ([#1743](https://github.com/jorenn92/Maintainerr/issues/1743)) ([beb326a](https://github.com/jorenn92/Maintainerr/commit/beb326a47a13f480ab858e1a7a0c178f474425af))

# [2.16.0](https://github.com/jorenn92/Maintainerr/compare/v2.15.0...v2.16.0) (2025-05-28)


### Bug Fixes

* Rule groups not in consistent order ([#1787](https://github.com/jorenn92/Maintainerr/issues/1787)) ([fe5c0d2](https://github.com/jorenn92/Maintainerr/commit/fe5c0d286406cf7e5fb13a6725be2b06f54bc5c0))
* Tautulli settings not updating until restart ([#1804](https://github.com/jorenn92/Maintainerr/issues/1804)) ([ddae9d3](https://github.com/jorenn92/Maintainerr/commit/ddae9d3fd4b6932bb56662c1dea79597ccb9ec13))
* Test media failing due to missing AbortSignal ([#1802](https://github.com/jorenn92/Maintainerr/issues/1802)) ([3d088b0](https://github.com/jorenn92/Maintainerr/commit/3d088b0de1445b5de7055f30673aaf36a8ba6826))


### Features

* Request stop of running rules ([#1735](https://github.com/jorenn92/Maintainerr/issues/1735)) ([7a08d94](https://github.com/jorenn92/Maintainerr/commit/7a08d94f490abbe4bfd68d66ed29a5c35aa5ba10))
* Save rule results against collection log ([#1777](https://github.com/jorenn92/Maintainerr/issues/1777)) ([f379b39](https://github.com/jorenn92/Maintainerr/commit/f379b39bb8df4009eb0b5cae5374aee904310fe2))

# [2.15.0](https://github.com/jorenn92/Maintainerr/compare/v2.14.0...v2.15.0) (2025-05-23)


### Bug Fixes

* Is (part of) latest aired/airing season should exclude future ([#1732](https://github.com/jorenn92/Maintainerr/issues/1732)) ([f7093df](https://github.com/jorenn92/Maintainerr/commit/f7093df90f809d210eead14cd0e958a0d7ba0ee7))
* Modals not responsive ([#1729](https://github.com/jorenn92/Maintainerr/issues/1729)) ([b14f7e3](https://github.com/jorenn92/Maintainerr/commit/b14f7e3160321ef4a375fe020569adfad5555b1a))
* Radarr Monitored returns null instead of false ([#1746](https://github.com/jorenn92/Maintainerr/issues/1746)) ([6b5c159](https://github.com/jorenn92/Maintainerr/commit/6b5c15942013b317c6ea6e665d3be74a3cab7861))
* Remove floating promises ([#1776](https://github.com/jorenn92/Maintainerr/issues/1776)) ([cd3c3b3](https://github.com/jorenn92/Maintainerr/commit/cd3c3b38ca42463edafebc33ae22282bdb88b24c))
* Test media targeting the wrong rule group ([#1728](https://github.com/jorenn92/Maintainerr/issues/1728)) ([42165b5](https://github.com/jorenn92/Maintainerr/commit/42165b5141d9a9cb4c71e622ac3b1660ec1dc518))
* Unparsable log lines breaking the logs page ([#1772](https://github.com/jorenn92/Maintainerr/issues/1772)) ([87eee65](https://github.com/jorenn92/Maintainerr/commit/87eee65586285be7b19b057b667f6348920fc29b))


### Features

* Add notification support ([#1381](https://github.com/jorenn92/Maintainerr/issues/1381)) ([d729fbf](https://github.com/jorenn92/Maintainerr/commit/d729fbf2056d0ecaa15966548601bd5abc7aeef0))
* Improve Tautulli settings UX ([#1621](https://github.com/jorenn92/Maintainerr/issues/1621)) ([3a9721f](https://github.com/jorenn92/Maintainerr/commit/3a9721fab2dcf1834a8f10edd3bcfad4be1e7d87))
* Log unhandledRejection & uncaughtException ([#1733](https://github.com/jorenn92/Maintainerr/issues/1733)) ([139cd5b](https://github.com/jorenn92/Maintainerr/commit/139cd5b2da1d9eea1acf6b1bb9b13f21d8adaf2f))
* Retry failed Plex API requests ([#1775](https://github.com/jorenn92/Maintainerr/issues/1775)) ([d3769eb](https://github.com/jorenn92/Maintainerr/commit/d3769ebf5566eb3fe9c07e7429bcac77f02ee78f))
* update rule creation UI/UX & toasts ([#1696](https://github.com/jorenn92/Maintainerr/issues/1696)) ([6c34075](https://github.com/jorenn92/Maintainerr/commit/6c34075d3f94b01f97bbfe81605bcf4dc5e08e6b))
* YAML Importer Modal additions ([#1754](https://github.com/jorenn92/Maintainerr/issues/1754)) ([66db26e](https://github.com/jorenn92/Maintainerr/commit/66db26eb0c22881930ef5fb58768e23b5fb087e2))

# [2.14.0](https://github.com/jorenn92/Maintainerr/compare/v2.13.1...v2.14.0) (2025-04-15)


### Bug Fixes

* Ensure signals are passed down to the apps ([#1680](https://github.com/jorenn92/Maintainerr/issues/1680)) ([702fc17](https://github.com/jorenn92/Maintainerr/commit/702fc17feeae9dcc40b625c0710b9478158a182f))
* force reset Overseerr throwing exception ([#1699](https://github.com/jorenn92/Maintainerr/issues/1699)) ([c74416f](https://github.com/jorenn92/Maintainerr/commit/c74416fa702d6268fde3a77ed9a5df1306d513a1))
* Reintroduce episode # in media card ([#1688](https://github.com/jorenn92/Maintainerr/issues/1688)) ([b25159d](https://github.com/jorenn92/Maintainerr/commit/b25159d7a846a81bb68e5e777739edf8ca19f3b6))
* Restrict Test Media to the collection's library ([#1693](https://github.com/jorenn92/Maintainerr/issues/1693)) ([c254d93](https://github.com/jorenn92/Maintainerr/commit/c254d931d75dc2fc8862db394cafb11b5bf0ed1e))
* stop returning music libraries ([#1695](https://github.com/jorenn92/Maintainerr/issues/1695)) ([7202890](https://github.com/jorenn92/Maintainerr/commit/7202890181827d26f2536e7525df07b912799451))
* Unable to save rules with 'Bigger' actions ([#1697](https://github.com/jorenn92/Maintainerr/issues/1697)) ([920a86b](https://github.com/jorenn92/Maintainerr/commit/920a86b1df41c35de073f1dbace6ecb4189d5797))


### Features

* Add episode number & file path rules ([#1673](https://github.com/jorenn92/Maintainerr/issues/1673)) ([6b3e4c9](https://github.com/jorenn92/Maintainerr/commit/6b3e4c90bf4cd2a76bd993782917a346c2001b21))
* Add rule & collection job status indicators ([#1659](https://github.com/jorenn92/Maintainerr/issues/1659)) ([aebf3ae](https://github.com/jorenn92/Maintainerr/commit/aebf3ae40befcee0e83796d797c979ca96ab5174))

## [2.13.1](https://github.com/jorenn92/Maintainerr/compare/v2.13.0...v2.13.1) (2025-04-03)


### Bug Fixes

* list types not showing underlying T type options in ui ([#1682](https://github.com/jorenn92/Maintainerr/issues/1682)) ([658860f](https://github.com/jorenn92/Maintainerr/commit/658860f523782e6d223320557d40ee106e132329))

# [2.13.0](https://github.com/jorenn92/Maintainerr/compare/v2.12.0...v2.13.0) (2025-04-01)


### Features

* allow checking show status when mediaType=season ([#1649](https://github.com/jorenn92/Maintainerr/issues/1649)) ([832c440](https://github.com/jorenn92/Maintainerr/commit/832c440ba1a1e37a2a0b4cf5f40234250cdc624b))
* allow comparing list sizes against a number ([#1530](https://github.com/jorenn92/Maintainerr/issues/1530)) ([a321cbd](https://github.com/jorenn92/Maintainerr/commit/a321cbdbb3295f4e2b56c1a9d4e3ae15124362b1))
* Allow Jellyfin & Emby users in Jellyseerr rule ([#1661](https://github.com/jorenn92/Maintainerr/issues/1661)) ([5482b8b](https://github.com/jorenn92/Maintainerr/commit/5482b8bc17e7a415d23aa77fd52414bfbea8afdb))

# [2.12.0](https://github.com/jorenn92/Maintainerr/compare/v2.11.0...v2.12.0) (2025-03-22)


### Bug Fixes

* No driver (HTTP) has been selected ([a984b11](https://github.com/jorenn92/Maintainerr/commit/a984b1158f1dd0f9df50450524145b58018b56e9))


### Features

* Add show rating rules to season & episode types ([#1627](https://github.com/jorenn92/Maintainerr/issues/1627)) ([793d046](https://github.com/jorenn92/Maintainerr/commit/793d046ae2380539bbaa56f1d99649145fa83122))
* Add smart collection filters ([#1630](https://github.com/jorenn92/Maintainerr/issues/1630)) ([8ac61fa](https://github.com/jorenn92/Maintainerr/commit/8ac61facb8f4fd15906bb3a3fdf2c5ea27e9aac7))
* Retry failed API requests ([35c36d9](https://github.com/jorenn92/Maintainerr/commit/35c36d9ffd2eab695df6795c0a45aa4b121634fe))

# [2.11.0](https://github.com/jorenn92/Maintainerr/compare/v2.10.0...v2.11.0) (2025-03-11)


### Bug Fixes

* Cannot read properties of undefined (reading 'statistics') ([#1617](https://github.com/jorenn92/Maintainerr/issues/1617)) ([1b7864f](https://github.com/jorenn92/Maintainerr/commit/1b7864f72a315683ac2a5a45a161ebb568142993))
* Contracts not included in Docker build ([#1612](https://github.com/jorenn92/Maintainerr/issues/1612)) ([0f9917a](https://github.com/jorenn92/Maintainerr/commit/0f9917adc079403d3d1213b909841cd460788a76))
* Incorrect community rules version comparison ([#1593](https://github.com/jorenn92/Maintainerr/issues/1593)) ([d4bd6e9](https://github.com/jorenn92/Maintainerr/commit/d4bd6e961e216c06cdfbcdcf1029b0d456bfdace))
* Overseerr/Jellyseerr invalid API key passing test ([#1619](https://github.com/jorenn92/Maintainerr/issues/1619)) ([28f2cb3](https://github.com/jorenn92/Maintainerr/commit/28f2cb372a892d553bde7b5261633568ae498b9d))
* Prevent invalid state for add buttons ([#1591](https://github.com/jorenn92/Maintainerr/issues/1591)) ([b49e34f](https://github.com/jorenn92/Maintainerr/commit/b49e34fdacf2a511b1dc7db0b184a0bea78abb01))
* Sonarr returns monitored=true if non-existent ([#1608](https://github.com/jorenn92/Maintainerr/issues/1608)) ([b5a752d](https://github.com/jorenn92/Maintainerr/commit/b5a752d2cd22e30c04ea2c7c8df8b7c931043b24)), closes [/github.com/Sonarr/Sonarr/issues/5761#issuecomment-1607959602](https://github.com//github.com/Sonarr/Sonarr/issues/5761/issues/issuecomment-1607959602)
* Test media breaking a running rule executor ([#1618](https://github.com/jorenn92/Maintainerr/issues/1618)) ([c749fc5](https://github.com/jorenn92/Maintainerr/commit/c749fc524b32813a831342cef63cdfd8bf0cf62c))


### Features

* Add a 'Do nothing' rule action ([#1600](https://github.com/jorenn92/Maintainerr/issues/1600)) ([a292668](https://github.com/jorenn92/Maintainerr/commit/a292668a928456584f151b590a807f3020abce66))
* Add IMDB, RT and TMDB Plex rating filters ([#1604](https://github.com/jorenn92/Maintainerr/issues/1604)) ([9516e6b](https://github.com/jorenn92/Maintainerr/commit/9516e6b74aacabbf3e319f59c47dd08f5678d3e2))
* Add Jellyseerr support ([#1606](https://github.com/jorenn92/Maintainerr/issues/1606)) ([1202275](https://github.com/jorenn92/Maintainerr/commit/1202275723209bf1c40d7755ee93eb7d1367c649))
* Add log settings, view and download ([#1545](https://github.com/jorenn92/Maintainerr/issues/1545)) ([e6f4a4d](https://github.com/jorenn92/Maintainerr/commit/e6f4a4d8da4d2d7e5d8fc2f4160bac2fc2eda44a))
* allow Section 1 Rule 1 deletion if other rules are present ([#1592](https://github.com/jorenn92/Maintainerr/issues/1592)) ([d3925a0](https://github.com/jorenn92/Maintainerr/commit/d3925a0a6c982963340abd99d4ed6ab99902c49f))

# [2.10.0](https://github.com/jorenn92/Maintainerr/compare/v2.9.0...v2.10.0) (2025-02-19)


### Features

* Replace plex-api ([#1561](https://github.com/jorenn92/Maintainerr/issues/1561)) ([e061715](https://github.com/jorenn92/Maintainerr/commit/e061715b96ffe17ebd8283b0dff64f7b753b18c5))

# [2.9.0](https://github.com/jorenn92/Maintainerr/compare/v2.8.0...v2.9.0) (2025-02-05)


### Bug Fixes

* Deleting Show via Plex fallback ([#1547](https://github.com/jorenn92/Maintainerr/issues/1547)) ([0025c42](https://github.com/jorenn92/Maintainerr/commit/0025c420efe784bc6f533e0b5cbed41cf68408a9))
* Media Modal and Remove button clash ([#1544](https://github.com/jorenn92/Maintainerr/issues/1544)) ([0f19906](https://github.com/jorenn92/Maintainerr/commit/0f19906b8f38f11b1861c0503f979299215c8e38))
* update optional page route param to new syntax ([#1528](https://github.com/jorenn92/Maintainerr/issues/1528)) ([65471de](https://github.com/jorenn92/Maintainerr/commit/65471de5b81622187b954cf2bf2d6f50a33968dd))


### Features

* Add media modal to overview & restyle rules ([#1505](https://github.com/jorenn92/Maintainerr/issues/1505)) ([6601709](https://github.com/jorenn92/Maintainerr/commit/6601709ca7fda95a99d5ac3fa3f16045439106bc))
* Added a boolean check for watchlisted status ([#1506](https://github.com/jorenn92/Maintainerr/issues/1506)) ([41b5c37](https://github.com/jorenn92/Maintainerr/commit/41b5c37cfe89ac6eeab70256b986c1a9222c52d0))

# [2.8.0](https://github.com/jorenn92/Maintainerr/compare/v2.7.0...v2.8.0) (2025-01-14)


### Bug Fixes

* Has series/season finale should only pass when file exists ([#1502](https://github.com/jorenn92/Maintainerr/issues/1502)) ([00e0255](https://github.com/jorenn92/Maintainerr/commit/00e02557380d0bc9d8c10f8d82e19d59d9184d4e))


### Features

* Add "Last episode aired at (season)" for episodes ([#1491](https://github.com/jorenn92/Maintainerr/issues/1491)) ([fecf360](https://github.com/jorenn92/Maintainerr/commit/fecf360ecae0d1add7ba4d6121704debd708725e))

# [2.7.0](https://github.com/jorenn92/Maintainerr/compare/v2.6.0...v2.7.0) (2025-01-05)


### Bug Fixes

* Equals with lists now only returns true if they are identical ([e900dac](https://github.com/jorenn92/Maintainerr/commit/e900dac47a26cd2f8422584d3eaa9c0a94f7073a))


### Features

* Add rating vote count filters ([05617e1](https://github.com/jorenn92/Maintainerr/commit/05617e12f6f9d8e8a95c39a86f87a02aca8d26ec))

# [2.6.0](https://github.com/jorenn92/Maintainerr/compare/v2.5.0...v2.6.0) (2025-01-01)


### Bug Fixes

* Docs links ([#1487](https://github.com/jorenn92/Maintainerr/issues/1487)) ([d8bf2d1](https://github.com/jorenn92/Maintainerr/commit/d8bf2d140fccb7d45a3e33a2f4d6426b33684dc8))


### Features

* Add rating filters (RT, IMDb, Trakt) ([4b79f56](https://github.com/jorenn92/Maintainerr/commit/4b79f56aa63ae31388874a1400f873b97dede2b9))

# [2.5.0](https://github.com/jorenn92/Maintainerr/compare/v2.4.1...v2.5.0) (2024-12-30)


### Bug Fixes

* *arr server not persisting on initial save ([#1475](https://github.com/jorenn92/Maintainerr/issues/1475)) ([8ace636](https://github.com/jorenn92/Maintainerr/commit/8ace63659ded1d44eb99fc6c81f00121c91a4b76))
* Client side error when changing rule data/media type ([2e086b2](https://github.com/jorenn92/Maintainerr/commit/2e086b2d76ac6893b56962e7c0d5960c9d1852c9))
* Resolve various UI & UX issues ([#1452](https://github.com/jorenn92/Maintainerr/issues/1452)) ([354b903](https://github.com/jorenn92/Maintainerr/commit/354b903bf4ff1dee216792a15de9d85304994e35))


### Features

* Add season has season/series finale episode ([f53d094](https://github.com/jorenn92/Maintainerr/commit/f53d0949e2291319891ce27424c47e827fcdb615))
* Add season number filter ([f0fd71e](https://github.com/jorenn92/Maintainerr/commit/f0fd71e7062e83553b8bee951adf20a474e7cf2b))

## [2.4.1](https://github.com/jorenn92/Maintainerr/compare/v2.4.0...v2.4.1) (2024-12-25)


### Bug Fixes

* Do not reset collection on *arr server change ([#1467](https://github.com/jorenn92/Maintainerr/issues/1467)) ([6bcc45e](https://github.com/jorenn92/Maintainerr/commit/6bcc45ed9df47956eda3f692c6486f33e742c137))

# [2.4.0](https://github.com/jorenn92/Maintainerr/compare/v2.3.1...v2.4.0) (2024-12-20)


### Bug Fixes

* Community rules & incorrect out of date ([#1448](https://github.com/jorenn92/Maintainerr/issues/1448)) ([1797104](https://github.com/jorenn92/Maintainerr/commit/17971044d88e84bb66fd80a772206ed7dda4d030))
* Media type selection not reflecting what is saved ([#1444](https://github.com/jorenn92/Maintainerr/issues/1444)) ([47a9651](https://github.com/jorenn92/Maintainerr/commit/47a9651fa579c38e23012a2b6d4878b88ceaf0dc))


### Features

* add about page ([#1408](https://github.com/jorenn92/Maintainerr/issues/1408)) ([56fda5c](https://github.com/jorenn92/Maintainerr/commit/56fda5c129183feafd867839b92fc94e6ed52b9e))

## [2.3.1](https://github.com/jorenn92/Maintainerr/compare/v2.3.0...v2.3.1) (2024-12-17)


### Bug Fixes

* Container startup failing for some ([3a18d2e](https://github.com/jorenn92/Maintainerr/commit/3a18d2e8c2a1f3144f2b5831b11b3723b0f0c64f))

# [2.3.0](https://github.com/jorenn92/Maintainerr/compare/v2.2.1...v2.3.0) (2024-12-17)


### Bug Fixes

* __PATH_PREFIX__ not replaced when using user directive ([#1394](https://github.com/jorenn92/Maintainerr/issues/1394)) ([9b237ea](https://github.com/jorenn92/Maintainerr/commit/9b237ea403224f9742bcb2cde7ba586a8a5fdcd1))
* changed all docs URLs to match new docs URL generations. ([c8161a3](https://github.com/jorenn92/Maintainerr/commit/c8161a3a1fd62c5765681e4eb843f16f9f0bd278))
* Docker startup ([ce4e7ad](https://github.com/jorenn92/Maintainerr/commit/ce4e7ad06ecca1d3fcb2112e85ca8a4641098041))
* error when overseerr URL is null ([a2aeb99](https://github.com/jorenn92/Maintainerr/commit/a2aeb994757acdaacd0de694e253a327f1fdaeea))
* Handling collections failure after multi arr ([e299c15](https://github.com/jorenn92/Maintainerr/commit/e299c1508ecf0718f8acf6f4cfdbbc24777fe3be))
* Ignore Plex smart collections due to library corruption ([#1355](https://github.com/jorenn92/Maintainerr/issues/1355)) ([7cf6780](https://github.com/jorenn92/Maintainerr/commit/7cf6780e62ef7a4332a5e089da5823be4bf93226))
* lint issues ([149dc78](https://github.com/jorenn92/Maintainerr/commit/149dc78d08beed8df967e8da576307b8cf02f1ce))
* Only allow saving successfully tested settings ([bd88567](https://github.com/jorenn92/Maintainerr/commit/bd88567f60a6371d3804b5b898fa19037714caa4))
* **package.json:** lint:server script ([575a6c5](https://github.com/jorenn92/Maintainerr/commit/575a6c58ea678ef87e4ae2ab1e9200462ef257b7))
* Remove cached arr API client on setting changes ([3081105](https://github.com/jorenn92/Maintainerr/commit/308110509a83f526162d0c2cd245081c2c6eb4a6))
* Revert defaulting to ipv6 ([8ee4888](https://github.com/jorenn92/Maintainerr/commit/8ee4888d44ffafa99ced262f9316d626884fb9ed))
* Sonarr media existence check in collection handling ([8cd0030](https://github.com/jorenn92/Maintainerr/commit/8cd00301410c7eef1c2ac973834bafd6416e73d0))
* Trim trailing slash in Overseerr URL ([d3dab2d](https://github.com/jorenn92/Maintainerr/commit/d3dab2d964200d9df70957288237bd4892f10960))


### Features

* Add "Original Language" rule to Sonarr & Radarr ([#1407](https://github.com/jorenn92/Maintainerr/issues/1407)) ([bf6bf49](https://github.com/jorenn92/Maintainerr/commit/bf6bf4918bab5116044a002d904b839618169d42))
* Add "Show on library recommended" option ([ccc13ba](https://github.com/jorenn92/Maintainerr/commit/ccc13ba526117691670b1eb741a14e4b36416dd4))
* Add base path support ([#1373](https://github.com/jorenn92/Maintainerr/issues/1373)) ([9597bfa](https://github.com/jorenn92/Maintainerr/commit/9597bfa69f29e508e8762ddfad1d2c3cccd39528))
* Add envars to control service ports ([#1333](https://github.com/jorenn92/Maintainerr/issues/1333)) ([b418975](https://github.com/jorenn92/Maintainerr/commit/b4189752ce265b16e2b28a7c4eecc0385903fe07))
* Support mutiple *arr servers ([156aca1](https://github.com/jorenn92/Maintainerr/commit/156aca12fd599e490dd68a60100c9f2a210a859a))

## [2.2.1](https://github.com/jorenn92/Maintainerr/compare/v2.2.0...v2.2.1) (2024-11-06)


### Bug Fixes

* Saving rules when Tautulli not configured ([7f1211e](https://github.com/jorenn92/Maintainerr/commit/7f1211e074d9fc7ad33855596941b77b83564eed))

# [2.2.0](https://github.com/jorenn92/Maintainerr/compare/v2.1.2...v2.2.0) (2024-11-05)


### Bug Fixes

* Add additional Tautulli rules ([#1287](https://github.com/jorenn92/Maintainerr/issues/1287)) ([e3bb69e](https://github.com/jorenn92/Maintainerr/commit/e3bb69ec4c3206978db6235a09e92128231dc65f))
* Added Curl in the Docker-container so users can create healthchecks ([#1288](https://github.com/jorenn92/Maintainerr/issues/1288)) ([1aff795](https://github.com/jorenn92/Maintainerr/commit/1aff795eabb5d4a4b9db8fc77d820b56e8a396e7))
* Align Tautulli username results with Overseerr ([#1339](https://github.com/jorenn92/Maintainerr/issues/1339)) ([5bab5d9](https://github.com/jorenn92/Maintainerr/commit/5bab5d976ad27569136f40be3129869cb08903f5))
* Changed the hostname to :: to enable ipv6 compatibility ([#1259](https://github.com/jorenn92/Maintainerr/issues/1259)) ([a0f93d4](https://github.com/jorenn92/Maintainerr/commit/a0f93d43b3abdd85f0bbeb03332ee8468dea95ab))
* Collection details not showing in Safari ([#1316](https://github.com/jorenn92/Maintainerr/issues/1316)) ([1e89cf6](https://github.com/jorenn92/Maintainerr/commit/1e89cf624520f036b056d55ff1e9182e918cca56))
* Plex cache reset handling if not all apps configured ([#1291](https://github.com/jorenn92/Maintainerr/issues/1291)) ([09003c1](https://github.com/jorenn92/Maintainerr/commit/09003c1c82c27dd58fffcfa1981aa30e16e5d67a))
* Tautulli Times viewed & Total views ([#1290](https://github.com/jorenn92/Maintainerr/issues/1290)) ([3f41a3c](https://github.com/jorenn92/Maintainerr/commit/3f41a3c25c838783ba6eb90d44baa1b72ae0a7de))


### Features

* Add base URL to Tautulli settings ([#1315](https://github.com/jorenn92/Maintainerr/issues/1315)) ([f569a95](https://github.com/jorenn92/Maintainerr/commit/f569a95a88a7d9e8b221483f7c75187a7654d376))
* Add per collection override of the Tautulli watched percent ([#1300](https://github.com/jorenn92/Maintainerr/issues/1300)) (Thanks [@benscobie](https://github.com/benscobie)) ([96a73a6](https://github.com/jorenn92/Maintainerr/commit/96a73a6275e6a34efc3d7f9f54150571b3a9f275))
* Add Tautulli integration (Thanks to [@benscobie](https://github.com/benscobie)) ([#1280](https://github.com/jorenn92/Maintainerr/issues/1280)) ([55aa547](https://github.com/jorenn92/Maintainerr/commit/55aa54750c956b29ea4633f3714faf6d2b752fb4))

## [2.1.2](https://github.com/jorenn92/Maintainerr/compare/v2.1.1...v2.1.2) (2024-09-13)


### Bug Fixes

* Fixed the 'Viewed by' rule for the server owner for movies. This was already fixed for TV shows in 2.1.1 ([#1266](https://github.com/jorenn92/Maintainerr/issues/1266)) ([a41e8ab](https://github.com/jorenn92/Maintainerr/commit/a41e8ab476ee4fcf62e6edd3d2ce9079444c8e0c))

## [2.1.1](https://github.com/jorenn92/Maintainerr/compare/v2.1.0...v2.1.1) (2024-09-09)


### Bug Fixes

* Fixed an issue where 'Users that saw all available episodes' & 'Users that watch the show/season/episode' wouldn't work for the owner user after 2.1.0 ([#1252](https://github.com/jorenn92/Maintainerr/issues/1252)) ([bf8c2d3](https://github.com/jorenn92/Maintainerr/commit/bf8c2d31cb5961e44643356ae84a9744427df187))
* The server no longer crashes when community.plex.tv rate limits have been hit. Also improved logging and increased API paging chunks to minimize the occurrence of this error. ([#1253](https://github.com/jorenn92/Maintainerr/issues/1253)) ([8227f8c](https://github.com/jorenn92/Maintainerr/commit/8227f8c2b2739460929b1b8cf381016efcb94732))
* When a Tvdb ID isn't found, a warning with the media item's title is now displayed ([fb27332](https://github.com/jorenn92/Maintainerr/commit/fb273323fe6ddd689d976d7717a9c86728ae62cd))

# [2.1.0](https://github.com/jorenn92/Maintainerr/compare/v2.0.4...v2.1.0) (2024-09-02)


### Bug Fixes

* Added extra error handling to Overseerr's isRequested rule ([#1232](https://github.com/jorenn92/Maintainerr/issues/1232)) ([dc42a98](https://github.com/jorenn92/Maintainerr/commit/dc42a987f7a76deec454595384f13d371ac8c090))
* Fetching movies by tmdbId no longer utilizes Radarr's lookup endpoint ([#1214](https://github.com/jorenn92/Maintainerr/issues/1214)) ([1a84b8c](https://github.com/jorenn92/Maintainerr/commit/1a84b8cf505bb6216af8a85ab907b3c912bdd267))
* Fixed an issue where Overseerr's 'requested by' rule failed to fetch the Plex user when the user uses a display name ([a4422f5](https://github.com/jorenn92/Maintainerr/commit/a4422f578effca020be8b27ffb828c92c7a7bb56))
* Fixed an issue where Overseerr's 'requested by' rule failed to fetch the Plex user when the user uses a display name ([#1231](https://github.com/jorenn92/Maintainerr/issues/1231)) ([9f1cc65](https://github.com/jorenn92/Maintainerr/commit/9f1cc6562148d2d631d6a3d05d4d12f74613f756))
* Fixed Radarr file size rule, when 'sizeOnDisk' is not available, it'll now fall back to movieFile.size ([#1205](https://github.com/jorenn92/Maintainerr/issues/1205)) ([1aac50b](https://github.com/jorenn92/Maintainerr/commit/1aac50bc3e7d3be9d64e14950004619581944c6c))
* Improved logging when media is not removable through *arr ([#1177](https://github.com/jorenn92/Maintainerr/issues/1177)) ([074c7c3](https://github.com/jorenn92/Maintainerr/commit/074c7c39acd5560e40c7a20ebe8b35c048ac7a6b))
* Improved Overseerr rule logs in case of failures ([#1178](https://github.com/jorenn92/Maintainerr/issues/1178)) ([f6466e3](https://github.com/jorenn92/Maintainerr/commit/f6466e332be246505b1d00db6946ca1bfc7e873e))


### Features

* Added an integration with the Plex community API and introduced a 'Plex - Watchlisted by' rule utilizing this endpoint ([#1152](https://github.com/jorenn92/Maintainerr/issues/1152)) ([1ebba97](https://github.com/jorenn92/Maintainerr/commit/1ebba9766421439689a0a63dde4a85aef23845f1))

## [2.0.4](https://github.com/jorenn92/Maintainerr/compare/v2.0.3...v2.0.4) (2024-06-19)


### Bug Fixes

* Added "Last Aired At" rule for shows & seasons (Thanks [@benfugate](https://github.com/benfugate)) ([63db845](https://github.com/jorenn92/Maintainerr/commit/63db845291445330f86b1c009c466341cf9735bc))
* Adjusted UI to listen to all interfaces, resolving issues with multiple networks ([#1104](https://github.com/jorenn92/Maintainerr/issues/1104)) ([017a25d](https://github.com/jorenn92/Maintainerr/commit/017a25d73a792728fa227c7bd526ed50e9c12a1a))
* Fixed an issue where .next/cache directory creation would fail when using a custom user ([#1102](https://github.com/jorenn92/Maintainerr/issues/1102)) ([fa9a30c](https://github.com/jorenn92/Maintainerr/commit/fa9a30c8181ccafe3614e2d5e113f61ff89a7a26))
* Fixed an issue where fetching some Plex ratingkeys from shows would fail ([2268513](https://github.com/jorenn92/Maintainerr/commit/226851358ad856d761985b8d3f6d20864cfe4ac0))
* Fixed an issue where having an operator on the first rule would make the rule return a 'null' value ([ce18dea](https://github.com/jorenn92/Maintainerr/commit/ce18dea65be7df37215671f7a9c810c8a34b7c76))
* Redirected all links to the hosted documentation & removed the internal Jsdoc documentation server ([#1134](https://github.com/jorenn92/Maintainerr/issues/1134)) ([0ed8164](https://github.com/jorenn92/Maintainerr/commit/0ed8164bac6894dc2c5094876a36e016cfd0caae)), closes [#1119](https://github.com/jorenn92/Maintainerr/issues/1119) [#1119](https://github.com/jorenn92/Maintainerr/issues/1119) [#1119](https://github.com/jorenn92/Maintainerr/issues/1119) [#1119](https://github.com/jorenn92/Maintainerr/issues/1119)

## [2.0.3](https://github.com/jorenn92/Maintainerr/compare/v2.0.2...v2.0.3) (2024-03-25)


### Bug Fixes

* Automatically prepend https for Overseerr, Sonarr and Radarr when choosing port 443 ([1616cfd](https://github.com/jorenn92/Maintainerr/commit/1616cfd0c4196b298fd5699621f17e07e68de768))
* Ensure proper URL generation on the settings pages by handling the pathname in hostnames correctly ([f8a80a7](https://github.com/jorenn92/Maintainerr/commit/f8a80a7787105e1d9a8e01f02785796fbccc3853))
* Fixed an issue where episodes would only be deleted, but not unmonitored when using the 'Unmonitor and delete episode' rule action ([#943](https://github.com/jorenn92/Maintainerr/issues/943)) ([070b381](https://github.com/jorenn92/Maintainerr/commit/070b381f05c1856e8789b32de8fef010350881c6))
* **rules:** Season action 'unmonitor and delete existing episodes' will now correctly remove and unmonitor existing episodes. The season itself will stay monitored. ([#951](https://github.com/jorenn92/Maintainerr/issues/951)) ([c5a135b](https://github.com/jorenn92/Maintainerr/commit/c5a135b94b42e7d2faf2b91ecda61d6ccfefa682))
* Shows will now be correctly unmonitored when using the 'unmonitor..' Sonarr action. Previously, only the seasons would be unmonitored ([e6bff13](https://github.com/jorenn92/Maintainerr/commit/e6bff13626a98852163cd7bf5c8ba921c78ec16b))

## [2.0.2](https://github.com/jorenn92/Maintainerr/compare/v2.0.1...v2.0.2) (2024-02-11)


### Bug Fixes

* Failure to fetch latest GitHub version crashes the UI ([#891](https://github.com/jorenn92/Maintainerr/issues/891)) ([4ce9ac9](https://github.com/jorenn92/Maintainerr/commit/4ce9ac9b353669db31b1781edff5d66f3b1addee))

## [2.0.1](https://github.com/jorenn92/Maintainerr/compare/v2.0.0...v2.0.1) (2024-02-09)


### Bug Fixes

* **docker:** ensure $HOME is set consistently for all configs. ([f952bba](https://github.com/jorenn92/Maintainerr/commit/f952bbaf103aeb90cf088742cf46bd8ca61b1477))
* Resolve SQL error during Plex collection recreation ([be1b801](https://github.com/jorenn92/Maintainerr/commit/be1b8017bd7d4c8387fa5cbea797e373d1f3e63b))
* Resolved an issue where Plex's SSL flag would not be updated correctly on the settings page ([d65927a](https://github.com/jorenn92/Maintainerr/commit/d65927a761439e1e3df511c3a5d3ba7e287db35c))

# [2.0.0](https://github.com/jorenn92/Maintainerr/compare/v1.7.1...v2.0.0) (2024-02-02)


### Bug Fixes

* **build:** Added a workaround for the 'Text file busy' error when using an old Linux kernel on the Docker host. ([19f75bd](https://github.com/jorenn92/Maintainerr/commit/19f75bd121412849b8fb86ff9b0d0d5d56bbc703))
* **collection handling:** Ensure media not found in Starr apps is still deleted if required by the Starr action ([#812](https://github.com/jorenn92/Maintainerr/issues/812)) ([d55bfe2](https://github.com/jorenn92/Maintainerr/commit/d55bfe28cee4c8bcccd8ea53abf160e2183871aa))
* **docker:** Improved flexibility by enabling custom users with the Docker 'user' directive. The previous implementation restricted this to the 'node' user ([496401f](https://github.com/jorenn92/Maintainerr/commit/496401fe6ff0a0c3167844f81d77af6a29858272))
* Move the supervisord.log file to the data directory ([#777](https://github.com/jorenn92/Maintainerr/issues/777)) ([cd5df98](https://github.com/jorenn92/Maintainerr/commit/cd5df989d566808c286a85152b7a1489a7caec62))
* **rules:** Addressed an issue where certain collection-related rules exhibited unexpected behavior when media was added to other groups in the same run ([56c133a](https://github.com/jorenn92/Maintainerr/commit/56c133ac6750dbad4a744e4d46ec2482fc58aba4))
* **rules:** Fixed an issue where the 'Plex - present in amount of other collections' rule wouldn't work with custom collections ([493a3ea](https://github.com/jorenn92/Maintainerr/commit/493a3ea4ddab441c70f4b27a03bbe2b7a67af88b))
* **rules:** Resolved an issue where the 'Overseerr - Requested by user' rule didn't work for local Overseerr users ([#822](https://github.com/jorenn92/Maintainerr/issues/822)) ([5391538](https://github.com/jorenn92/Maintainerr/commit/539153824cb8543f0d5b32576a86fe4892c62e01))
* **rules:** Resolved an issue where the Sonarr status rule was incorrectly mapped and couldn't function ([a4bb4df](https://github.com/jorenn92/Maintainerr/commit/a4bb4df691ba791330e5ecbc93508a449ea42809))
* **settings:** Resolved an issue where updated cron schedules were not visible on the UI until the application was reloaded ([87a2091](https://github.com/jorenn92/Maintainerr/commit/87a2091bdf975dd68a3de1397ba895292dac97c0))
* **tasks:** Improved task management by limiting the simultaneous execution of rule and collection handler tasks to one. Additionally, ensured that collection handling cannot occur concurrently with rule handling ([bb3d16c](https://github.com/jorenn92/Maintainerr/commit/bb3d16cc23020b5988530e2d524cdb37965ad208))
* **ui:** Added feedback to the manual rule & collection handling buttons ([f1183c0](https://github.com/jorenn92/Maintainerr/commit/f1183c0daa4ffd08d3e754a2f1db7cbec8138a31))


### Code Refactoring

* add data directory permission check ([bbced56](https://github.com/jorenn92/Maintainerr/commit/bbced56c64adb1ccb13f7d5bf05b5f5b34dc5fca))
* Updated UI Docker port to use non-privileged port 6246 ([4751079](https://github.com/jorenn92/Maintainerr/commit/4751079d42b2e2a87d14f801564e0138c63104e7))


### Features

* Added the ability to test media items against a rule, returning a detailed execution breakdown ([72cf392](https://github.com/jorenn92/Maintainerr/commit/72cf3922055ca1ffbddaf65acb6307fc94a5fe77))
* **collections:** Added a collection info screen with details and history logs & enhanced TypeORM Implementation, shifted running of migrations to the NestJS Process. ([e260985](https://github.com/jorenn92/Maintainerr/commit/e260985ffe15d27d3163957b1882ae6ff1e8bcfc))
* **collections:** Added an indicator to the collection media card that an item was added manually ([12a4cb2](https://github.com/jorenn92/Maintainerr/commit/12a4cb242aa81832db96d22c40cb7b7fb3f5a010))
* **collections:** Added exclusions to the collection detail screen ([76d29ef](https://github.com/jorenn92/Maintainerr/commit/76d29ef2522ee938b69d108727020b82bec59438))
* Implemented Winston logger for improved logging. Daily log rotation has been introduced, and logs are now stored under the /opt/data/logs directory ([0e3ab51](https://github.com/jorenn92/Maintainerr/commit/0e3ab511b8e42743050f780685a660fff45e739b))
* **rules:**  Introduced the capability to import and export rules using YAML. Additionally, included a rule glossary in the documentation. ([97c52d4](https://github.com/jorenn92/Maintainerr/commit/97c52d456b06c9f35c4d414fe9b79fe5a58f8abe))
* **rules:** Added new rule: Plex - [list] Labels ([1c5a89a](https://github.com/jorenn92/Maintainerr/commit/1c5a89ab35a5c6b9d12119694dfc7977ec357784))
* **rules:** Added new variants of the existing collection rules for seasons and episodes, these will include collection data of the parent season/show as well ([#813](https://github.com/jorenn92/Maintainerr/issues/813)) ([9d91b4a](https://github.com/jorenn92/Maintainerr/commit/9d91b4addcc1e4d675c9125daf52f479bf532274))
* **rules:** Introduced Radarr & Sonarr rules to retrieve file locations ([#814](https://github.com/jorenn92/Maintainerr/issues/814)) ([5963c74](https://github.com/jorenn92/Maintainerr/commit/5963c7459fe3ea9a44120a1b8b84e99d5db8bd51))
* Run application as non-root ([006a122](https://github.com/jorenn92/Maintainerr/commit/006a122ac391c29fe5c6440c37cb0b4d4f954dbe))
* **settings:** Added the ability to find and load available Plex servers from the settings menu ([#811](https://github.com/jorenn92/Maintainerr/issues/811)) ([9c75917](https://github.com/jorenn92/Maintainerr/commit/9c75917f8c5db472bf7d4481e90a980f36edef7a))
* **ui:** Added a version indicator ([#807](https://github.com/jorenn92/Maintainerr/issues/807)) ([a126561](https://github.com/jorenn92/Maintainerr/commit/a12656197e4222028beaf9582e57c5fcccda471b))
* Upgraded to Yarn modern, improved the docker image size and added a contribution guide ([#770](https://github.com/jorenn92/Maintainerr/issues/770)) ([6233b71](https://github.com/jorenn92/Maintainerr/commit/6233b71f333ae83b26269c01e00d9072a18ea818))


### BREAKING CHANGES

* The container now runs as an unprivileged user. It is essential to ensure that the exposed data directory is read/writeable by either the user specified in the 'user' directive or, if no directive is provided, by the default UID:GID 1000:1000.
* Previously, the UI port was set to port 80, which is privileged. This has been updated to non-privileged port 6246. Ensure to adjust your Dockerfile or docker run command to reflect this change.

## [1.7.1](https://github.com/jorenn92/Maintainerr/compare/v1.7.0...v1.7.1) (2024-01-06)


### Bug Fixes

* **maintenance:** Extended the maintenance task with an action to remove orphaned collection objects ([f5826cc](https://github.com/jorenn92/Maintainerr/commit/f5826cc1f4e2997586ec1fa2cc704d7a85d01e8e))
* **plex:** Fixed an issue where fetching Plex users would fail if connection to plex.tv failed ([2458a8f](https://github.com/jorenn92/Maintainerr/commit/2458a8f62797d3122e2577493f73948c85ab4c9b))
* **rules:** Extended the Plex - rating rule ([ef95481](https://github.com/jorenn92/Maintainerr/commit/ef95481d8653d0d84bf3c00a92bf046b8abc50e6))
* **rules:** Fixed an issue where 'Plex - Present in amount of other collections' wouldn't work as expected ([1c4accd](https://github.com/jorenn92/Maintainerr/commit/1c4accdacf17738878cb60bde60bd176b3dc6426))
* **rules:** Fixed an issue where an item would be stuck inside the internal collection when it was removed manually ([1eae15f](https://github.com/jorenn92/Maintainerr/commit/1eae15f094ad081d20829db638f3cb44789f2137))
* **rules:** Fixed an issue where the "Plex - Last episode added at" rule order was affected by the library's Plex Episode Sorting setting ([67299c4](https://github.com/jorenn92/Maintainerr/commit/67299c4d6f94aa2f104694e4fab265fe4767af70))
* **rules:** Resolved an issue where a nullpointer could occur when fetching playlists. ([a0400b8](https://github.com/jorenn92/Maintainerr/commit/a0400b865999a986cfdcef6bb8603f8f0483e62b))

# [1.7.0](https://github.com/jorenn92/Maintainerr/compare/v1.6.10...v1.7.0) (2023-12-21)


### Bug Fixes

* **api:** added a 10s cancellation signal for outgoing status API calls ([3766b34](https://github.com/jorenn92/Maintainerr/commit/3766b3484b30310be64ce472adab502b1b08d2cd))
* **collection handler:** Improved handling of movies without Tmdb ID's in Plex metadata. ([9df2cd4](https://github.com/jorenn92/Maintainerr/commit/9df2cd4da6e9bd8b322fc262297744f493af09aa))
* **collectionHandler:** Fixed an issue where a media item without a tvdb id could crash te server ([c70bead](https://github.com/jorenn92/Maintainerr/commit/c70beadb6e5bd8b84220affeeb53861b8ccb94b4))
* **overview:** Reworked the overview add popup. It's now possible to manually add & remove seasons and episodes ([99329b2](https://github.com/jorenn92/Maintainerr/commit/99329b259dfc69832672ad03a8d471daeb90f383))
* **Plex:** Add container-size header to API calls that missed it ([069c281](https://github.com/jorenn92/Maintainerr/commit/069c281cd778b00f25aa9650eadda51ba18ba9ee))
* **rules:** Fixed an issue where errors would be printed in the log when handling a show without a valid tvdb id ([e2ad5e1](https://github.com/jorenn92/Maintainerr/commit/e2ad5e195b1d1c844f15cfb3442a30f68b01ec41))
* **rules:** Fixed an issue where Plex & Overseerr would use different usernames when the Plex display name was edited or contains special characters ([39c9529](https://github.com/jorenn92/Maintainerr/commit/39c952936cbeab8d9d43c4fe2e5fc531915c8e17))
* **settings:** Resolved an issue where resetting the Plex authentication token would fail ([17333e4](https://github.com/jorenn92/Maintainerr/commit/17333e4f8a70e36ec64bfd0a0f614b643084dcd0))
* **sonarr:** Fixed an issue where fetching series by TVDB ID could fail ([9866534](https://github.com/jorenn92/Maintainerr/commit/986653481735536d803d2c1dd373937d83451169))
* **tmdb:** Fixed an issue where an error could occur while trying to fetch the TMDB ID from an item ([bc5b918](https://github.com/jorenn92/Maintainerr/commit/bc5b91882919e73feb83d119493bff405c867d13))


### Features

* **maintenance:** Added a job that performs system maintenance tasks ([15b0b19](https://github.com/jorenn92/Maintainerr/commit/15b0b19837d411ea56d9c5758c3ede2a8c3b8286))
* **overview:** Reworked the exclusion feature to support season and episodes from the UI ([ee59907](https://github.com/jorenn92/Maintainerr/commit/ee59907e2a4478ee1f718237b9b2403dcc2feeb0))

## [1.6.10](https://github.com/jorenn92/Maintainerr/compare/v1.6.9...v1.6.10) (2023-11-23)


### Bug Fixes

* **settings:** Fixed an issue where initial Radarr & Sonarr configuration would crash the client ([94dfcff](https://github.com/jorenn92/Maintainerr/commit/94dfcffe5cd74ecde13585506374b23ceb5873a9))
* **ui:** Collection backdrop images now also leverage the configured caching option ([d28b530](https://github.com/jorenn92/Maintainerr/commit/d28b5303b2f7d2a13748f6a5ee4fc93f475ad4f8))
* **ui:** Replace leftover Image components with CachedImage ([c8d172f](https://github.com/jorenn92/Maintainerr/commit/c8d172ff82fe212ff3968c79b431720d0ea77335))

## [1.6.9](https://github.com/jorenn92/Maintainerr/compare/v1.6.8...v1.6.9) (2023-11-21)


### Bug Fixes

* **api:** Enhanced the external API caching mechanism to minimize redundant calls to external applications ([478da57](https://github.com/jorenn92/Maintainerr/commit/478da57a9f6d828e34b9f2a5fcf527a61df09529))
* **rules:** Added 2 rules for filtering Plex playlists ([e6f6621](https://github.com/jorenn92/Maintainerr/commit/e6f662174123fc6715ebd701dea0336027606f1c))
* **settings:** Added the ability to configure arr's with base URL ([5a94ac6](https://github.com/jorenn92/Maintainerr/commit/5a94ac6c2d6164aec2fe4c08a248bfa92dd1b8dc))
* **settings:** Added the ability to configure the cron rule & collection handler jobs ([3121cf6](https://github.com/jorenn92/Maintainerr/commit/3121cf6f1b54988e39ad9e356807466fe6ab1765))
* **settings:** Implemented the capability to customize the image caching behavior ([126881b](https://github.com/jorenn92/Maintainerr/commit/126881b2b9f234620272d3d451f7cf124d824606))

## [1.6.8](https://github.com/jorenn92/Maintainerr/compare/v1.6.7...v1.6.8) (2023-11-14)


### Bug Fixes

* **rules:** Added new rule 'Is part of latest aired/airing season' ([2f78a54](https://github.com/jorenn92/Maintainerr/commit/2f78a540c3e2806a5ee24c904136782aba71d040))
* **rules:** Alter the CONTAINS behavior so it now validates for partial matches ([a04fec2](https://github.com/jorenn92/Maintainerr/commit/a04fec238eaa364d428bbeb179d17a0a1c29167f))
* **rules:** Introduced the capability to detect partial text matches within text lists through the newly added 'Contains (Partial list match)' operator. ([5ee4c69](https://github.com/jorenn92/Maintainerr/commit/5ee4c6952a7f6f4ff8a86f57023df381d974a479))
* **rules:** Introduced the capability to include text lists in custom values using JSON notation ([aa0b229](https://github.com/jorenn92/Maintainerr/commit/aa0b229762862f49e6d3aa2b16c696a51d6607c8))

## [1.6.7](https://github.com/jorenn92/Maintainerr/compare/v1.6.6...v1.6.7) (2023-10-29)


### Bug Fixes

* **settings:** Fixed an issue where initial configuration could fail ([3bec671](https://github.com/jorenn92/Maintainerr/commit/3bec6713b38d64ef4d6ee5ba4d614008eef4bfb4))
* **ui:** Collection cards now scale correctly ([829e8a1](https://github.com/jorenn92/Maintainerr/commit/829e8a1ab17dd1c4547998fed86aed1314ab30ac))

## [1.6.6](https://github.com/jorenn92/Maintainerr/compare/v1.6.5...v1.6.6) (2023-10-27)


### Bug Fixes

* **rules:** Added Sonarr rules: 'Has unaired episodes', 'Number of monitored seasons / episodes' & 'Season has unaired episodes' ([71c3b25](https://github.com/jorenn92/Maintainerr/commit/71c3b25de162250f4af551364be4dd8b9d801bc6))
* **ui:** Improve media card spacing on different screen sizes ([8bd6f97](https://github.com/jorenn92/Maintainerr/commit/8bd6f9746772a4cef9ffb08df38fda5bdd9e0416))
* **ui:** The back button & searchbar now have a glass background ([6fcee47](https://github.com/jorenn92/Maintainerr/commit/6fcee47f85b43053d39c8a3ee70a2c1d0f095749))
* **ui:** The header back button is now the global return button. And the temporary collection detail 'rewind' button is gone ([1042de6](https://github.com/jorenn92/Maintainerr/commit/1042de6b9e736cb8e9a2e8174e88799f5793f161))

## [1.6.5](https://github.com/jorenn92/Maintainerr/compare/v1.6.4...v1.6.5) (2023-10-24)


### Bug Fixes

* **docker:** Added all components to a supervisor so component crashes are mitigated ([2ccc73d](https://github.com/jorenn92/Maintainerr/commit/2ccc73d8970541c0ea8e756f1354b02400b3f5b1))
* **rules:** Fixed an issue where 'OR' would not work as expected when used in rules (instead of sections) ([ef191b3](https://github.com/jorenn92/Maintainerr/commit/ef191b3dc03846533b27f714d37f3c2d6ec20428))
* **rules:** Fixed an issue where switching first values of the same type would not keep the previous second value, and could cause a corrupt rule ([e4fe5c1](https://github.com/jorenn92/Maintainerr/commit/e4fe5c108b1bd3e31e70f8f35368a19844892f71))
* **rules:** Fixed an issue where undefined return values during rule execution could crash the server ([a152251](https://github.com/jorenn92/Maintainerr/commit/a152251380897526c1da77915495aa736a33fbcd))
* **rules:** Improved Sonarr log messages ([c944e2d](https://github.com/jorenn92/Maintainerr/commit/c944e2d435c2f51497df0e0e0461ece69e49a760))
* **rules:** Improved the tvdb ID fallback mechanism for Sonarr rule values in case the tvdb ID is missing from Plex ([abd3dc8](https://github.com/jorenn92/Maintainerr/commit/abd3dc8bab4d86c2268220b39dc6fb08d2b7915c))
* **settings:** Fixed an issue where uppercase characters in hostname settings could cause a failure in communication ([a7f6351](https://github.com/jorenn92/Maintainerr/commit/a7f6351bdd05bd5c5980a2f63dd1b0d3a5200f6e))

## [1.6.4](https://github.com/jorenn92/Maintainerr/compare/v1.6.3...v1.6.4) (2023-10-10)


### Bug Fixes

* **rules:** Added clarification to the 'show on home' flag during rule creation ([2d4792d](https://github.com/jorenn92/Maintainerr/commit/2d4792d82524da5919a9a8bd141c31d4c9c772ca))
* **rules:** Fetching the watchHistory could throw an error when using the 'People that view show/season' rule ([9a1a3d6](https://github.com/jorenn92/Maintainerr/commit/9a1a3d6c47aabc4aeb57ac38e1190998652d3445))
* **rules:** Fixed some minor issues with NOT_CONTAINS & NOT_EQUALS ([fa08cbc](https://github.com/jorenn92/Maintainerr/commit/fa08cbc005fbd57fdf97292b13a275a964a03101))

## [1.6.3](https://github.com/jorenn92/Maintainerr/compare/v1.6.2...v1.6.3) (2023-10-05)


### Bug Fixes

* **rules:** Fixed an issue where contains would not work as expected when comparing 2 lists ([fd640e9](https://github.com/jorenn92/Maintainerr/commit/fd640e96019c8a605e228ddc9e4a6efcddec1fe1))

## [1.6.2](https://github.com/jorenn92/Maintainerr/compare/v1.6.1...v1.6.2) (2023-09-22)


### Bug Fixes

* **collections:** Added a 7 second timeout to the availability-sync trigger ([a662eda](https://github.com/jorenn92/Maintainerr/commit/a662eda76002390f5e88d35670767f11fb9d8e35))
* **rules:** Changed the default Overseer behavior to rely more on availability-sync. Added the option to trigger the old behavior (force remove requests) ([39f890c](https://github.com/jorenn92/Maintainerr/commit/39f890ce5cc90859084c3947fe656532c91c9a30))
* **rules:** Fixed an issue where not all rules would be available in the rule dropdown ([5f589e6](https://github.com/jorenn92/Maintainerr/commit/5f589e69d0fa3fb266da59a904c7b2cc6f6734f1))
* **rules:** Improved 'amount of collections'  & added the 'Collections media is present in' rule values ([1ffb69b](https://github.com/jorenn92/Maintainerr/commit/1ffb69b4e98eaa7df06ab2a5aa0a67f62fcb7c3e))

## [1.6.1](https://github.com/jorenn92/Maintainerr/compare/v1.6.0...v1.6.1) (2023-09-19)


### Bug Fixes

* **rules:** Fixed an issue where list exclusions would always be checked ([9280100](https://github.com/jorenn92/Maintainerr/commit/92801004a8efe87dcf93a2919d0e30fa7159c8b3))

# [1.6.0](https://github.com/jorenn92/Maintainerr/compare/v1.5.0...v1.6.0) (2023-09-18)


### Bug Fixes

* **rules & collections:** Fixed rule & collection handling issues when not all apps were configured ([54a25d5](https://github.com/jorenn92/Maintainerr/commit/54a25d5354bc974058ca829fc2098f3ef043a61e))
* **rules:** Fix  a problem where Sonarr's date rules don't work as expected ([d271fb0](https://github.com/jorenn92/Maintainerr/commit/d271fb050e66b787a28fff41b01e7e12bb789e58))
* **rules:** Fixed an issue where rule handling would fail when the Plex collection was manually removed. The collection will now get recreated. ([65f551d](https://github.com/jorenn92/Maintainerr/commit/65f551d412cb6c5c480114ed2d71e196607d803d))
* **settings:** Disabled configuration of apps while Plex is not yet configured ([69def0c](https://github.com/jorenn92/Maintainerr/commit/69def0cef289b5f2dbc3a5a87a408e05ce0be02e))


### Features

* **rules:** Added the possibility to add removed media to *arr's list exclusion ([37b511a](https://github.com/jorenn92/Maintainerr/commit/37b511aed262ac8d6957d6045e0b8932f1634d6f))

# [1.5.0](https://github.com/jorenn92/Maintainerr/compare/v1.4.2...v1.5.0) (2023-09-15)


### Features

* **rules:** Add possibility to unmonitor shows & movies without removing the files ([f41c2e8](https://github.com/jorenn92/Maintainerr/commit/f41c2e87c1c4ab6c0a2f339049f6995684321c11))
* **rules:** added the ability to create rules for seasons & episodes ([#474](https://github.com/jorenn92/Maintainerr/issues/474)) ([b6e8a6c](https://github.com/jorenn92/Maintainerr/commit/b6e8a6ccaf31f2be6ba389db64fbabb0ee40d263))

## [1.4.2](https://github.com/jorenn92/Maintainerr/compare/v1.4.1...v1.4.2) (2023-08-09)


### Bug Fixes

* **rules:** Fixed an issue where 'all episodes seen by' would not always work correctly after PR [#438](https://github.com/jorenn92/Maintainerr/issues/438) ([9862b48](https://github.com/jorenn92/Maintainerr/commit/9862b483128d20ab27119a9550ae61b720a79724))

## [1.4.1](https://github.com/jorenn92/Maintainerr/compare/v1.4.0...v1.4.1) (2023-08-01)


### Bug Fixes

* **plex-api:** fixed a problem where the initial creation of a Plex collection would fail ([a06f261](https://github.com/jorenn92/Maintainerr/commit/a06f26191d8313826103447372200726feec46f6))
* **rules:** fix a problem where "all available episodes seen by" not returned correctly when episode 1 of season 1 is not present ([2d890cc](https://github.com/jorenn92/Maintainerr/commit/2d890cc81b16d19dfe33e833cd0d130d5d18872b))
* **rules:** Fix a problem where booleans would always default to 'true' when editing rules ([bd6a68e](https://github.com/jorenn92/Maintainerr/commit/bd6a68e03b463fed24b3c94e6db8fd9c3d54b29b))
* **rules:** Fix a problem where the sonarr action would always default to the first option when editing rules ([811ef66](https://github.com/jorenn92/Maintainerr/commit/811ef6693016947f96536d536bd42dfa272ee243))
* **ui:** fixed an issue where the collection's library picker would behave wrong ([b6c5f83](https://github.com/jorenn92/Maintainerr/commit/b6c5f83786c1084034af5322b0f7a6376a4fd2a6))

# [1.4.0](https://github.com/jorenn92/Maintainerr/compare/v1.3.2...v1.4.0) (2023-02-21)


### Bug Fixes

* **docs:** fixed some documentation typo's ([331261f](https://github.com/jorenn92/Maintainerr/commit/331261f7e6b83f470586e57ac893a3c2aeebe581))
* **rules & collections:** improve error handling ([9746045](https://github.com/jorenn92/Maintainerr/commit/9746045579a1de884f0297bec3cf517b9cdb9f1c))
* **rules:** fix a problem where media couldn't get added anymore when something unexpected had happened to the Plex collection ([f0dcea7](https://github.com/jorenn92/Maintainerr/commit/f0dcea7e444505f2e953624ea439782b5b3cceeb))


### Features

* **rules & collections:** Manual Plex collections now auto sync with Maintainerr ([2a52436](https://github.com/jorenn92/Maintainerr/commit/2a52436ab000f31bd5d736617b6e3ad6669a17ab))
* **rules:** add the possibility to bypass Maintainerr's rule system. ([b037d11](https://github.com/jorenn92/Maintainerr/commit/b037d11aa176a285da6b911eb60179f48bbba5fa))

## [1.3.2](https://github.com/jorenn92/Maintainerr/compare/v1.3.1...v1.3.2) (2023-01-21)


### Bug Fixes

* app doesn't crash anymore on some raddar/sonnarr api errors ([f1a25e1](https://github.com/jorenn92/Maintainerr/commit/f1a25e1de59976bcee6ffc8ec40e69d8d8f01580))
* **collections:** Add extra add / removal logs in case of failure ([1d2a6e2](https://github.com/jorenn92/Maintainerr/commit/1d2a6e2eb0316e0c64eae3ceec6159f028979391))
* **collection:** Set machineId when needed if it wasn't set during boot (e.g. Plex wasn't available) ([0189670](https://github.com/jorenn92/Maintainerr/commit/01896707427b44802c63380a04e4877cb5d489bd))
* **docs:** added the need to disable Overseer's 'Enable CSRF Protection'  setting to the docs ([256bd48](https://github.com/jorenn92/Maintainerr/commit/256bd4811e1d1df8f21e4b8ccee90079fe8489d5))
* **modal:** fix a problem where a missing image symbol could be shown in some modals ([4738732](https://github.com/jorenn92/Maintainerr/commit/4738732bc98b0cd1316c3373d1e653fc25a56b01))
* **overseerr:** fix a problem where Overseerr media would only be cleared if a request exists ([b31e68d](https://github.com/jorenn92/Maintainerr/commit/b31e68d3f7aa9c8024409813a344b94deb1155b0))
* **ui:** collection background images are now correctly shown again ([5b5e182](https://github.com/jorenn92/Maintainerr/commit/5b5e182eb0887ddecac8f5dfcb27e859cf93f7e2))

## [1.3.1](https://github.com/jorenn92/Maintainerr/compare/v1.3.0...v1.3.1) (2022-11-19)


### Bug Fixes

* **collections:** Fix an issue where collections might not be deleted when empty. This results in a failure to add new media ([e3c6e1f](https://github.com/jorenn92/Maintainerr/commit/e3c6e1f93d20d413977caa730dd9f48441ff06bc))
* **collections:** fix log errors when trying to remove media from an already empty collection ([b7f89f2](https://github.com/jorenn92/Maintainerr/commit/b7f89f27fe99203e9932615ec43e93971993a04a))

# [1.3.0](https://github.com/jorenn92/Maintainerr/compare/v1.2.3...v1.3.0) (2022-09-30)


### Bug Fixes

* **community rules:** Close modal after upload ([473e732](https://github.com/jorenn92/Maintainerr/commit/473e732c217a792cbe064d393299fe97fa93c100))
* **community rules:** Improve spacing on community upload modal ([9cf575a](https://github.com/jorenn92/Maintainerr/commit/9cf575af54006598d59b42eb2d025e8cfde87803))
* **community rules:** Only show rules matching the selected library type ([c485a98](https://github.com/jorenn92/Maintainerr/commit/c485a98804d4efa7cd59a25257af10e9e35786ce))
* **docs:** docker compose yml spaces ([5b18322](https://github.com/jorenn92/Maintainerr/commit/5b18322b8c87204948527d5fdc36593237998055))


### Features

* **community rules:** Add the possibility to load & upload rules made by the community ([6eebeac](https://github.com/jorenn92/Maintainerr/commit/6eebeac4177772a457c58cc9a178b08aae4150d1))

## [1.2.3](https://github.com/jorenn92/Maintainerr/compare/v1.2.2...v1.2.3) (2022-06-29)


### Bug Fixes

* **build:** fix armv7 build issues ([073378c](https://github.com/jorenn92/Maintainerr/commit/073378cecc9341ec7cd35838395407f242f1b145))

## [1.2.2](https://github.com/jorenn92/Maintainerr/compare/v1.2.1...v1.2.2) (2022-06-10)


### Bug Fixes

* **ui:** searchbar too wide after latest tailwind update ([db0cd88](https://github.com/jorenn92/Maintainerr/commit/db0cd883f7729617151434208e3cdbdfc460a85b))

## [1.2.1](https://github.com/jorenn92/Maintainerr/compare/v1.2.0...v1.2.1) (2022-05-09)


### Bug Fixes

* **rules:** selecting boolean now auto sets value to 'true' ([39b90f0](https://github.com/jorenn92/Maintainerr/commit/39b90f0393e33a959aeb32865b274b16aacf907f))
* **settings:** obfuscate api keys ([1ad9b0a](https://github.com/jorenn92/Maintainerr/commit/1ad9b0a4972705474b33cbd38b86bcf2a08b133e))
* **ui:** hide navbar on initial load ([1c551a2](https://github.com/jorenn92/Maintainerr/commit/1c551a269614deffc47fbb65ebd588a463ba93ad))

# [1.2.0](https://github.com/jorenn92/Maintainerr/compare/v1.1.2...v1.2.0) (2022-05-06)


### Bug Fixes

* **settings:** fix missing plex auth key when saved after authentication ([d64fa8c](https://github.com/jorenn92/Maintainerr/commit/d64fa8cbcc14154d503792f6abe9767f28ac24e6))
* **ui:** docs button on each setting page ([a58cc85](https://github.com/jorenn92/Maintainerr/commit/a58cc855c561954405cce949afd5141bf647b091))
* **ui:** white background on input fields after tailwind upgrade ([3c27c24](https://github.com/jorenn92/Maintainerr/commit/3c27c24f92da85fdfe24e1101d9cfb4924c78d2f))


### Features

* **rules:** add 'is requested in overseerr' option ([2c3d469](https://github.com/jorenn92/Maintainerr/commit/2c3d469967533e7aab61d1a1ff3f86a21c4504cd))
* **rules:** new boolean custom type ([5a08fae](https://github.com/jorenn92/Maintainerr/commit/5a08fae75bb06821afd0191bb1fa5d0e9323fd71))

## [1.1.2](https://github.com/jorenn92/Maintainerr/compare/v1.1.1...v1.1.2) (2022-05-04)


### Bug Fixes

* **migration:** remove logic to move db from old location ([1da6474](https://github.com/jorenn92/Maintainerr/commit/1da6474555dc73cf9c221df33da60100a5fac438))
* **overview:** suppress image not found error ([7390a50](https://github.com/jorenn92/Maintainerr/commit/7390a50748de79aacb06b7642963f37086ad2f05))

## [1.1.1](https://github.com/jorenn92/Maintainerr/compare/v1.1.0...v1.1.1) (2022-05-04)


### Bug Fixes

* **docker:** add ormconfig during build step ([97d4411](https://github.com/jorenn92/Maintainerr/commit/97d4411c24205574852b983d8a4233fa0b5f348d))
* **docker:** add sharp during build step ([7887612](https://github.com/jorenn92/Maintainerr/commit/78876124c1eb3ed827983fc6ab795908c4e58424))
* **docker:** fix sharp install during docker build ([f54cb2a](https://github.com/jorenn92/Maintainerr/commit/f54cb2af2f2112ada8b52a7d620a494b5d20a84e))
* **docker:** set timeout during yarn install to unlimited ([71a61f8](https://github.com/jorenn92/Maintainerr/commit/71a61f84a9d01eeb28ac53574684cf0b0cc2cda6))

# [1.1.0](https://github.com/jorenn92/Maintainerr/compare/v1.0.0...v1.1.0) (2022-05-03)


### Bug Fixes

* **babel:** inconsistency in .babelrc ([f92fb5a](https://github.com/jorenn92/Maintainerr/commit/f92fb5a60a1710e3d94e7edc051c6de82e079d39))
* **deps:** remove semantic-release-docker-buildx dep ([b97e13c](https://github.com/jorenn92/Maintainerr/commit/b97e13ce436a6c97485886661e5321fd14947e32))
* **release:** Remove buildx build steps from release ([6c19466](https://github.com/jorenn92/Maintainerr/commit/6c19466a272ef70cc6411aa7a8f4f05cd061ae7b))
* Use force on npm install of UI ([bf5f933](https://github.com/jorenn92/Maintainerr/commit/bf5f9339195315a8011f6900d87b8b7dbe1a11e8))


### Features

* **release:** add multibranch build step ([b993dd2](https://github.com/jorenn92/Maintainerr/commit/b993dd24eefde6de4f17bae0f24a9983a67024cb))
