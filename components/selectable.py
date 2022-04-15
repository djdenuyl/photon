"""
Make object selectable

author: David den Uyl (djdenuyl@gmail.nl)
date: 2022-01-30
"""
from logging import debug
from pathlib import Path


class Selectable:
    """ A Selectable implements methods to select and deselect a container. """
    _bbox_width = 2
    _bbox_dash_length = 10
    _bbox_dash_spacing = 10

    _arrow_asset_path = Path('assets', 'images', 'sizing_arrow.png')

    def __init__(self, container):
        self.container = container
        self.canvas = self.container.canvas
        self.canvas.tag_bind(self.container.id, "<ButtonPress-1>", self.on_press, add='+')
        self.canvas.tag_bind(self.container.id, "<B1-Motion>", self.on_move, add='+')
        self.canvas.tag_bind(self.container.id, "<ButtonRelease-1>", self.on_release, add='+')
        self.bbox_id = None

        self.has_moved = False

    @property
    def tags(self):
        return self.canvas.gettags(self.container.id)

    def on_press(self, event):
        """ on click, execute select function if the widget does not have the 'selected' tag.
        no nothing if it is already selected """
        # if widget not selected, select it
        if 'selected' not in self.canvas.gettags(self.container.id):
            self._select()

        # debug statement
        self._debug(event)

    def on_move(self, _):
        """ Set has_moved to true when the selectable moves """
        self.has_moved = True

    def on_release(self, event):
        """ on releasing the button, check if the widget was not selected in the same click event, by checking
        the selection_event tag. If the tag is present, remove it because release marks the end of the click event.
        If the widget is selected (has 'selected' tag) and it has not moved during the click event,
        execute deselect function. Lastly, set has_moved back to false, because is marks the end of the click event. """
        if 'selection_event' in self.canvas.gettags(self.container.id):
            self.canvas.dtag(self.container.id, 'selection_event')
        elif 'selected' in self.canvas.gettags(self.container.id) \
                and not self.has_moved:
            self._deselect()

        self.has_moved = False

        # debug statement
        self._debug(event)

    def _select(self):
        """ finds the ids of currently selected items on the canvas and deselects those if they exist.
        Draws a bbox around the currently selected item and adds selected tags to the item and its bbox. """

        # deselect any already selected widget
        currently_selected = self.canvas.find_withtag('selected')
        if currently_selected is not None:
            for c in currently_selected:
                self._deselect(c)

        # draw the bbox around the selected widget
        self.bbox_id = self.canvas.create_rectangle(
            *self.canvas.bbox(self.container.id),
            dash=(self._bbox_dash_length, self._bbox_dash_spacing),
            width=self._bbox_width
        )

        # add 'selected' tag to selected item and its bbox
        self.canvas.addtag_withtag('selected', self.container.id)
        self.canvas.addtag_withtag('selected', self.bbox_id)
        self.canvas.addtag_withtag('selection_event', self.container.id)
        self.canvas.addtag_withtag('to_delete', self.bbox_id)

    def _deselect(self, other=None):
        """ deselects the objects if other is none else deselects the other object
        Also removes the bbox """
        [self.canvas.delete(c) for c in (self.canvas.find_withtag('to_delete') or [self.bbox_id])]
        self.canvas.dtag(other or self.container.id, 'selected')

    def _debug(self, event):
        debug(f'event: {event}, '
              f'obj: {self.__class__.__name__}, '
              f'id: {self.container.id}, '
              f'tags: {self.tags}')
