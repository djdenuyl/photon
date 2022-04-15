"""
Make object selectable

author: David den Uyl (djdenuyl@gmail.nl)
date: 2022-01-30
"""
from pathlib import Path

from components.mutable import Mutable


class Selectable(Mutable):
    """ A Selectable implements methods to select and deselect a container. """
    _bbox_width = 2
    _bbox_dash_length = 10
    _bbox_dash_spacing = 10

    _arrow_asset_path = Path('assets', 'images', 'sizing_arrow.png')

    def __init__(self, container):
        super().__init__(container)
        self._add_binding('<ButtonPress-1>', self.on_press)
        self._add_binding('<B1-Motion>', self.on_move)
        self._add_binding('<ButtonRelease-1>', self.on_release)

        self.bbox_id = None
        self.has_moved = False

    def on_press(self, event):
        """ on click, execute select function if the widget does not have the 'selected' tag.
        no nothing if it is already selected """
        # if widget not selected, select it
        if 'selected' not in self.tags:
            self._select()
            self._add_tag('selected')
            self._add_tag('selection_event')

        # debug statement
        self._debug(event)

    def on_move(self, _):
        """ Set has_moved to true when the selectable moves """
        self.has_moved = True

    def on_release(self, event):
        """ on releasing the button, check if the widget was not selected in the same click event, by checking
        the selection_event tag. If the tag is present, remove it because release marks the end of the click event.
        If the widget is selected (has 'selected' tag) and it has not moved during the click event,
        and the rotation arrows were not created during the event, execute deselect function.
        Lastly, set has_moved back to false, because is marks the end of the click event. """
        if 'selection_event' in self.tags:
            self._remove_tag('selection_event')
        elif 'selected' in self.tags \
                and not self.has_moved\
                and not self._tagged('rotation_arrows_selection_event'):
            self._deselect()

        self.has_moved = False

        # debug statement
        self._debug(event)

    def _select(self):
        """ finds the ids of currently selected items on the canvas and deselects those if they exist.
        Draws a bbox around the currently selected item and adds selected tags to the item and its bbox. """

        # deselect any already selected widget
        currently_selected = self._tagged('selected')
        if currently_selected is not None:
            for c in currently_selected:
                self._deselect(c)

        # draw the bbox around the selected widget
        self.bbox_id = self.canvas.create_rectangle(
            *self.bbox,
            dash=(self._bbox_dash_length, self._bbox_dash_spacing),
            width=self._bbox_width
        )

        # add 'selected' tag to bbox
        self._add_tag('to_delete', self.bbox_id)
        self._add_tag('selected', self.bbox_id)

    def _deselect(self, other=None):
        """ deselects the objects if other is none else deselects the other object
        Also removes the bbox """
        # deletes bbox and associated arrows
        [self._delete(c) for c in (self._tagged('to_delete') or [self.bbox_id])]

        # removes the selected tag
        self._remove_tag('selected', other or self.container.id)
