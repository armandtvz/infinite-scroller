# Infinite Scroller

A JS package that loads new content when the user scrolls down a page. Don't
use this pattern lightly - see the "[before using infinite scrolling][100]"
section for more info on why. 5kB minified.




Demo
----
See a demo of the package [here][3].




Quickstart
----------
1. Include the JS before your closing `<body>` tag.
```html
<script src="https://cdn.jsdelivr.net/gh/armandtvz/infinite-scroller/dist/infinite_scroller.min.js" charset="utf-8"></script>
```

1. Add the sentinel, scroller and loader element's HTML, for example:
```html
<div id="scroller">
    ...
</div>
<div id="sentinel" style="width: 1px; height: 1px;"></div>
<div id="loader" class="loader" hidden></div>
```

1. Initialize the `Scroller` object. See the [config options][101] heading for more
   info on configuration.
```javascript
const scroller = new Scroller({
    scroller_id: 'scroller',
    sentinel_id: 'sentinel',
    loader_id: 'loader',
    get_url_func: (page_number) => {
        return `/items/?page=${page_number}`;
    },
});
```




Before using infinite scrolling
-------------------------------
Read [this article][4] from [Nielsen Norman Group][5] titled "Infinite Scrolling Is
Not for Every Website". Here's an extract from the article:
> Infinite scrolling has advantages, but should be applied with caution. Take
> into account your site's content and the user's motivation. Endless scrolling
> is not recommended for goal-oriented finding tasks, such as those requiring
> people to locate specific content or compare options. For ecommerce sites,
> finding products by feature might be difficult to accomplish quickly if all
> of the products are presented linearly on a never-ending page, without sorting
> or other filtering or navigation techniques to help isolate the intended item.

> There are psychological consequences to endless scrolling that can hurt the
> user experience as well. For task-driven activities, infinite scrolling can
> feel like  drowning in an information abyss with no end in sight. People who
> need specific types of information expect content to be grouped and layered
> according to relevance, by pages. Web users don't mind clicking links (e.g.,
> a link to the next page) if each click is meaningful and leads them closer
> to the desired goal.




How it works
------------
The scroller listens on scroll events using a passive event listener. On scroll,
the package checks the distance of the sentinel element relative to the top of
the viewport. If the distance exceeds the scroll threshold new content is
requested and appended to the scroller element - unless new content is still
being loaded from a previous scroll event in which case nothing happens.




Handling JSON responses from the server
---------------------------------------
Use the `process_json_to_html_func` config option to provide a function that
can handle the JSON response and return the newly built raw HTML string. This
function can also return an array of HTML elements.
```javascript
const scroller = new Scroller({
    ...
    process_json_to_html_func: (response) => {
        const response_data = response['items'];
        const items = JSON.parse(response_data);
        let html = '';

        for (let i = 0; i < items.length; i++)
        {
            const items = items[i];
            const item = '<div class="item"></div>';
            html += item;
        }

        return html;
    },
});
```




Retries after failed requests
-----------------------------
1. Requests are retried after network errors, HTTP 50x errors and HTTP 429
  (Too Many Requests) statuses. Any other HTTP 40x statuses are viewed as errors.

1. An exponential backoff algorithm is used with jitter. For more details on
   the exact implementation check the source.

1. There is a maximum of 10 retry attempts. When the maximum number of retry
   attempts are exceeded the `scroller_end` event will fire.

1. The `Retry-After` header is checked for both `delay-seconds` and
   `IMF-fixdate` values.

1. If the `Retry-After` header's value is too far in the future - more than 2
   hours in the future - it will stop retrying and the `scroller_end` event
   will fire.




Events
------
## scroller_updated
Fires when the scroller element has been updated with new elements.

## scroller_end
Fires in these situations:
1. When there is no more content to load. This would happen when an HTTP 204
   status (No Content) has been returned or when the response is empty.
1. When the maximum amount of retries have been exceeded.
1. When a `Retry-After` header's value is 2 or more hours in the future.

When the scroller "ends" the following happens:
1. The scroll event listener is removed.
1. The loader is hidden by setting it's `opacity` to `0` and it's `display`
   CSS property to `none`.
1. The `scroller_end` event is fired.


### Checking why the scroller has reached it's end.
To check why the scroller has ended, check the event detail object:
```javascript
if (event.detail.retries_exhausted)
{
    // Do something
}
if (event.detail.retry_too_far_in_future)
{
    // Do something
}
if (event.detail.was_error)
{
    // Do something
}
if (event.detail.http_status === 403)
{
    // Do something
}
```




Accessibility
-------------

## aria-busy
If the scroller element has an existing `aria-busy` attribute then the package
will update the attribute to `true` when new content is being loaded and will
set it back to `false` after new items have been appended to the scroller.




Scroll anchoring and using a button to load more content
--------------------------------------------------------
Scroll anchoring can cause problems when using a "load more" button. On
browsers that support scroll-anchoring, scroll is anchored on the button
instead of the content. Therefore, use `overflow-anchor` to disable it on
the load more button.
```CSS
#load-more-button {
    overflow-anchor: none;
}
```




What this package does not do
-----------------------------
- Breaks the back button. If you need to be able to navigate between pages of
  infinitely-scrolled content then you should probably not be using infinite
  scrolling - rather use regular pagination. Just because it *can* be done
  doesn't mean that it *should* be done. Also, users might not trust the
  back button to work when using an infinite scroller because of the
  inconsistency in different implementations of infinite scrollers across
  the web - some might break the back button, but some others might not.
- Does not recycle DOM nodes. Adding this feature is still being considered.
- Does not report progress of requests for new content.




Compatiblity
------------
- This package does not support Internet Explorer or Opera Mini.
- Written in ES6 ([caniuse.com][2]).
- Uses XMLHttpRequest; not the Fetch API.
- Uses getBoundingClientRect.

According to caniuse.com (full support, not partial support):
- Chrome 51+
- Firefox 54+
- Safari 10+
- Edge 15+
- Opera 38+
- iOS Safari 10+
- Chrome for Android 84
- Firefox for Android 68




Config options
--------------

### scroller_id (required)
| Type         | Attributes   | Default      |
| ------------ | ------------ | ------------ |
| String       | required     |              |

The ID of the element to append new items to.


### sentinel_id (required)
| Type         | Attributes   | Default      |
| ------------ | ------------ | ------------ |
| String       | required     | sentinel     |

The ID of the element used to check if new items should be added by checking
it's position relative to the viewport when there is a scroll event.


### get_url_func (required)
| Type         | Attributes   | Default      |
| ------------ | ------------ | ------------ |
| Function     | required     |              |

The function used to build the URL used to fetch the next page of items.
The page number is passed to this function as the first parameter.


### loader_id (required)
| Type         | Attributes   | Default      |
| ------------ | ------------ | ------------ |
| String       | required     |              |

The ID of the element to use as a loading icon.


### process_json_to_html_func
| Type         | Attributes   | Default      |
| ------------ | ------------ | ------------ |
| Function     |              |              |

The function used to build the raw HTML string from the JSON response - can also
return an array of HTML elements. The XHR response is passed as-is to this function
as the first parameter.


### preload
| Type         | Attributes   | Default      |
| ------------ | ------------ | ------------ |
| Boolean      |              | false        |

If set to true, new items will immediately be added on page load instead of
waiting for a scroll event or a button click.


### start_page_number
| Type         | Attributes   | Default      |
| ------------ | ------------ | ------------ |
| Number       |              | 1            |

The first page to fetch. The page number is incremented after each new
page is fetched.


### threshold_factor
| Type         | Attributes   | Default      |
| ------------ | ------------ | ------------ |
| Number       |              | 0.4          |

Used to determine the scroll threshold. This number gets multiplied with the
viewport height to become the scroll threshold.


### threshold
| Type         | Attributes   | Default      |
| ------------ | ------------ | ------------ |
| Number       |              |              |

The scroll threshold in pixels. If you don't want to use the `threshold_factor`
setting, use this to set the scroll threshold directly. The scroll threshold,
when added to the viewport height, becomes the distance between the sentinel
element and the top of the viewport at which to trigger loading new content.


### button_id
| Type         | Attributes   | Default      |
| ------------ | ------------ | ------------ |
| String       |              |              |

The ID of the element to use as a load-more button. Setting this switches
automatic content loading off.


### max_retries
| Type         | Attributes   | Default      |
| ------------ | ------------ | ------------ |
| Number       |              | 10           |

The maximum amount of times a failed request can be retried.


### max_backoff_ms
| Type         | Attributes   | Default      |
| ------------ | ------------ | ------------ |
| Number       |              | 20000        |

The maximum amount of time that can be waited, in milliseconds, before retrying
a failed request. This means that the exponential backoff algorithm cannot
exceed the value of `max_backoff_ms`.




Versioning
----------
This package follows [semantic versioning][1] (SemVer).




License and code of conduct
---------------------------
Check the root of the repo for these files.




[//]: # (Links)

[1]: https://semver.org/
[2]: https://caniuse.com/#feat=es6
[3]: https://armandtvz.com/demos/infinite-scroller/
[4]: https://www.nngroup.com/articles/infinite-scrolling/
[5]: https://www.nngroup.com/

[100]: #before-using-infinite-scrolling
[101]: #config-options
