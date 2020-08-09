'use strict';

const scroller_utils = (function()
{
    function required_arg(arg = undefined)
    {
        const error = new Error(`Required argument missing (${arg})`);
        Error.captureStackTrace(error, required_arg);
        throw error;
    }

    return {
        required_arg: required_arg,
    };
})();




class ScrollerConfigError extends Error
{
    constructor(message = scroller_utils.required_arg('message'))
    {
        super(message);
        this.name = 'ScrollerConfigError';
    }
}




/**
 * @class
 *
 * @param {String} obj.scroller_id - The ID of the element to append new items to.
 *
 * @param {Function} obj.get_url_func - The function used to build the URL used
 * to fetch the next page of items. The page number is passed to this function
 * as the first parameter.
 *
 * @param {Function} [obj.process_json_to_html_func = undefined] - The function
 * used to build the raw HTML string from the JSON response - can also return an
 * array of HTML elements. The XHR response is passed to this function as the
 * first parameter.
 *
 * @param {String} [obj.sentinel_id = 'sentinel'] - The ID of the element used
 * to check if new items should be added by checking it's position relative to
 * the viewport when there is a scroll event.
 *
 * @param {Number} [obj.start_page_number = 1] - The first page to fetch. The
 * page number is incremented after each new page is fetched.
 *
 * @param {String} obj.loader_id - The ID of the element to use as a loading icon.
 *
 * @param {String} [obj.button_id = undefined] - The ID of the element to use
 * as a load-more button. Setting this switches automatic content loading off.
 *
 * @param {Boolean} [obj.preload = false] - If set to true, new items will
 * immediately be added on page load instead of waiting for a scroll event or
 * a button click.
 *
 * @param {Number} [obj.threshold_factor = 0.4] - Used to determine the scroll
 * threshold. This number gets multiplied with the viewport height to become
 * the scroll threshold.
 *
 * @param {Number} [obj.threshold = undefined] - The scroll threshold in pixels.
 * The scroll threshold, when added to the viewport height, becomes the distance
 * between the sentinel element and the top of the viewport at which to trigger
 * loading new content.
 *
 * @param {Number} [obj.max_retries = 10] - The maximum amount of times a failed
 * request can be retried.
 *
 * @param {Number} [obj.max_backoff_ms = 20000] - The maximum amount of time
 * that can be waited, in milliseconds, before retrying a failed request. This
 * means that the exponential backoff algorithm cannot exceed the value of
 * `max_backoff_ms`.
 */
function Scroller({
    scroller_id = scroller_utils.required_arg('scroller_id'),
    get_url_func = scroller_utils.required_arg('get_url_func'),
    process_json_to_html_func = undefined,
    sentinel_id = 'sentinel',
    start_page_number = 1,

    loader_id = scroller_utils.required_arg('loader_id'),
    button_id = undefined,

    preload = false,
    threshold_factor = 0.4,
    threshold = undefined,

    max_retries = 10,
    max_backoff_ms = 20000,
})
{
    if (! new.target)
    {
        throw new TypeError('Object cannot be created without the new keyword');
    }
    let page_number = start_page_number;
    let busy_loading = false;
    let has_scroll_listener = false;
    const scroller = document.getElementById(scroller_id);
    const sentinel = document.getElementById(sentinel_id);
    const loader = document.getElementById(loader_id);

    let load_more_button = undefined;
    if (button_id)
    {
        load_more_button = document.getElementById(button_id);
    }
    else
    {
        add_scroll_listener();
    }


    function do_checks()
    {
        const error_msg = 'could not be found. Check the config.';
        if (! scroller)
        {
            throw new ScrollerConfigError('Scroller element ' + error_msg);
        }
        if (! sentinel)
        {
            throw new ScrollerConfigError('Sentinel element ' + error_msg);
        }
        if (! loader)
        {
            throw new ScrollerConfigError('Loader element ' + error_msg);
        }
        if (button_id && ! load_more_button)
        {
            throw new ScrollerConfigError('Load more button ' + error_msg);
        }
    }
    do_checks();


    if (button_id)
    {
        load_more_button.addEventListener('click', (event) =>
        {
            event.preventDefault();
            load_more();
        });
    }


    let retries = 0;

    function get_new_items({
        url = scroller_utils.required_arg('url'),
        method = 'get',
        success_callback = scroller_utils.required_arg('success_callback'),
        error_callback = undefined,
        response_type = undefined,
    })
    {
        const xhr = new XMLHttpRequest();
        xhr.addEventListener('load', handle_xhr_load, {once: true});
        xhr.addEventListener('error', handle_xhr_error, {once: true});
        xhr.open(method, url);
        xhr.setRequestHeader('HTTP_X_REQUESTED_WITH', 'XMLHttpRequest');
        xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');

        if (response_type)
        {
            xhr.responseType = response_type;
        }

        function random_between(min, max)
        {
            return Math.floor(Math.random() * (max - min + 1) ) + min;
        }

        function get_backoff_time()
        {
            // https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/
            const base = 10;
            let backoff = (base * 2) ** retries;
            backoff = random_between(0, Math.min(backoff, max_backoff_ms));
            if (backoff < 100)
            {
                // Add extra time to very quick retries.
                // This is usually just the first retry attempt.
                backoff += random_between(100, 200);
            }
            return backoff;
        }

        function retry()
        {
            let retry_after = 0;
            if (retries < max_retries)
            {
                retries += 1;
                retry_after = xhr.getResponseHeader('Retry-After');
                if (retry_after)
                {
                    const retry_after_int = parseInt(retry_after);
                    if (isNaN(retry_after_int))
                    {
                        // When Retry-After header is in the IMF-fixdate
                        // format: Wed, 7 Oct 2020 07:07:00 GMT
                        retry_after = Date.parse(retry_after); // returns milliseconds since Unix epoch
                        retry_after = retry_after - Date.now(); // returns milliseconds
                    }
                    else
                    {
                        retry_after = Math.ceil(retry_after_int * 1000); // Convert seconds to ms
                    }

                    const two_hours_ms = 7200000;
                    if (retry_after > two_hours_ms)
                    {
                        const response = create_response_obj();
                        if (error_callback)
                        {
                            response.retry_too_far_in_future = true;
                            error_callback(response);
                        }
                        return;
                    }
                    // No negative numbers
                    if (retry_after < 0)
                    {
                        retry_after = get_backoff_time();
                    }
                }
                else
                {
                    retry_after = get_backoff_time();
                }
                console.info(
                    'Attempt to fetch new content failed. Will retry after '
                    + retry_after.toString() + ' milliseconds.'
                );

                setTimeout(() =>
                {
                    console.info('Starting retry attempt ' + retries + '...');
                    get_new_items({
                        url: url,
                        method: method,
                        success_callback: success_callback,
                        error_callback: error_callback,
                        response_type: response_type,
                    });
                    console.info('Retried.');
                }, retry_after);
            }
            else
            {
                console.info('Request for new content failed.');
                const response = create_response_obj();
                if (error_callback)
                {
                    if (max_retries > 0)
                    {
                        console.info('Maximum retries reached.');
                        response.retries_exhausted = true;
                    }
                    response.was_error = true;
                    error_callback(response);
                }
            }
        }

        function create_response_obj()
        {
            const response = {
                status: xhr.status,
                data: xhr.response,
                content_type: xhr.getResponseHeader('Content-Type'),
                retries_exhausted: undefined,
                retry_too_far_in_future: undefined,
                was_error: undefined,
            };
            return response;
        }

        function handle_xhr_load(event)
        {
            if (xhr.status >= 200 && xhr.status < 400)
            {
                const response = create_response_obj();
                success_callback(response);
            }
            else if (xhr.status >= 500 || xhr.status === 429)
            {
                handle_xhr_error(event);
            }
            else
            {
                if (error_callback)
                {
                    const response = create_response_obj();
                    response.was_error = true;
                    error_callback(response);
                }
            }
        }

        function handle_xhr_error(event = undefined)
        {
            retry();
        }
        xhr.send();
    }


    function add_scroll_listener()
    {
        document.addEventListener('scroll', load_more, {passive: true});
        has_scroll_listener = true;
    }


    function remove_scroll_listener()
    {
        document.removeEventListener('scroll', load_more, {passive: true});
        has_scroll_listener = false;
    }


    /**
     * @private
     *
     * Load more items into the infinite scroller.
     *
     * @returns {Boolean} - Will return `true` if new content gets loaded. If
     * `false` is returned then it means new content is still being loaded.
     * The current request for new content needs to finish before requesting
     * more.
     */
    function load_more()
    {
        if (busy_loading)
        {
            // Prevents us from sending requests for more content
            // while content is still being loaded.
            return false;
        }

        if (! button_id && has_scroll_listener === false)
        {
            add_scroll_listener();
        }

        const viewport_height = window.innerHeight || document.documentElement.clientHeight;
        const distance = sentinel.getBoundingClientRect();
        const distance_top = distance.top;

        // Can't use the ! operator to do falsy check because 0 is equivalent
        // to null or undefined for falsy checks. So `! threshold` where
        // threshold has a value of 0 will evaluate to true
        if (threshold === undefined || threshold === null)
        {
            threshold = viewport_height * threshold_factor;
        }

        // Not *just* outside the viewport but also within the bounds
        // set by the threshold. Must be between the viewport_height and
        // the viewport_height + threshold.
        const outside_the_viewport = (
            distance_top >= viewport_height
            && distance_top <= (viewport_height + threshold)
        );
        const inside_the_viewport = (
            distance_top >= 0
            && distance_top <= viewport_height
        );
        if (outside_the_viewport || inside_the_viewport)
        {
            _load_more();
            return true;
        }
        return false;
    }


    /**
     * @private
     *
     * Append new items to the scroller element.
     *
     * @param {String || Array} html - The new HTML to append to the scroller
     * element. Either a raw HTML string or an array of HTML elements.
     *
     * @fires scroller_updated - When new items have been successfully appended
     * to the scroller element.
     */
    function append_items(html)
    {
        let elements = undefined;
        if (process_json_to_html_func && Array.isArray(html))
        {
            elements = html;
        }
        else
        {
            // Create a fake element so we can "convert" the
            // raw HTML to actual HTML elements.
            const fake_element = document.createElement('div');
            fake_element.innerHTML = html;
            elements = fake_element.children;
            elements = Array.from(elements);
        }
        elements.forEach((element, i) =>
        {
            scroller.appendChild(element);
        });

        const scroller_updated_event = new CustomEvent('scroller_updated', {
            detail: {
                new_elements: elements,
            }
        });
        document.dispatchEvent(scroller_updated_event);

        ui_done_loading();
        return elements;
    }


    function ui_loading()
    {
        busy_loading = true;
        loader.style.opacity = '1';
        loader.removeAttribute('hidden');
        if (scroller.hasAttribute('aria-busy'))
        {
            scroller.setAttribute('aria-busy', 'true');
        }
    }


    function ui_done_loading({forever = false} = {forever: false})
    {
        busy_loading = false;
        loader.style.opacity = '0';
        loader.setAttribute('hidden', '');
        if (scroller.hasAttribute('aria-busy'))
        {
            scroller.setAttribute('aria-busy', 'false');
        }
        if (forever)
        {
            loader.style.display = 'none';
        }
    }


    function _load_more(response = undefined)
    {
        ui_loading();
        const url = get_url_func(page_number);
        let html = undefined;
        if (! response)
        {
            let response_type = undefined;
            if (process_json_to_html_func)
            {
                response_type = 'json';
            }
            get_new_items({
                url: url,
                method: 'get',
                success_callback: _load_more,
                error_callback: _error_callback,
                response_type: response_type,
            });
            return;
        }

        if (response.status === 204)
        {
            handle_end_of_content(response);
        }
        else
        {
            if (
                response.content_type !== 'application/json'
                && process_json_to_html_func
            )
            {
                throw new ScrollerConfigError(
                    'You should not be providing a process_json_to_html_func '
                    + 'callback because the server is not returning JSON. '
                    + 'Remove the callback from the config.'
                );
            }
            if (response.content_type === 'application/json')
            {
                if (process_json_to_html_func)
                {
                    html = process_json_to_html_func(response.data);
                }
                else
                {
                    throw new ScrollerConfigError(
                        'You must provide a process_json_to_html_func callback '
                        + 'because the server is returning JSON.'
                    );
                }
            }
            else
            {
                html = response.data;
            }

            if (! html)
            {
                handle_end_of_content(response);
            }
            else
            {
                append_items(html);
                page_number += 1;
            }
        }
    }
    if (preload)
    {
        _load_more();
    }


    function _error_callback(response)
    {
        if (
            response.retries_exhausted
            || response.retry_too_far_in_future
            || response.was_error
        )
        {
            handle_end_of_content(response);
        }
    }


    function handle_end_of_content(response = undefined)
    {
        ui_done_loading({forever: true});
        remove_scroll_listener();
        const scroller_end_event = new CustomEvent('scroller_end', {
            detail: {
                http_status: response.status,
                retries_exhausted: response.retries_exhausted,
                retry_too_far_in_future: response.retry_too_far_in_future,
                was_error: response.was_error,
            }
        });
        document.dispatchEvent(scroller_end_event);
    }
}
