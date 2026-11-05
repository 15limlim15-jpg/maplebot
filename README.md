# Mesos Deals Only V16

Chrome Manifest V3 extension based on the user-supplied V11 archive.

## Install

1. Download this branch using **Code → Download ZIP** and extract it.
2. Open `chrome://extensions` and enable Developer mode.
3. Choose **Load unpacked** and select the `Mesos_Deals_Only` directory.
4. Enter your Telegram bot token and chat ID in the popup and save locally. Existing values in extension storage are reused. No credentials are included in this repository.
5. Use GO to discover an item's filters, select values and a target price, then Start Monitoring.

## Validation and limitations

This is a candidate for live testing. mesos.watch returned HTTP 403 in the development environment. The DOM adapter has only been tested against synthetic fixtures; compatibility with current live controls and actual filtered results is unverified. Unsupported controls or missing confirmation stop monitoring with an error. Actual Telegram delivery has not been tested. See `V16_VALIDATION_HE.txt` for manual checks.

Search jobs persist independently of popup lifetime. Watch storage operations are serialized to preserve concurrent tab state. Telegram formatting, the original content monitoring script, and sound assets are retained. Embedded Telegram defaults were removed for safe distribution; configure them locally.
