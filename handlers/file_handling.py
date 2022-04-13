"""
Handling of storage and retrieval of files

Created on 2022-01-19

@author: David den Uyl (ddenuyl@bebr.nl)
"""
import json
from enum import Enum
from os import getcwd, remove
from os.path import join
from tkinter import Button
from tkinter.filedialog import askopenfilename, asksaveasfilename
from PIL import Image
from components.container import Container

DEFAULT_PHOTON_EXTENSION = '.hv'
DEFAULT_IMAGE_EXTENSION = '.png'


class ImageExtension(Enum):
    """ enum of supported image extensions """
    PNG = ('PNG Files', '*.png')
    ALL = ('All File', '*.*')


class PhotonExtension(Enum):
    """ enum of supported Photon extensions """
    HV = ('Photon Files', '*.hv')
    ALL = ('All File', '*.*')


class NewFileCreator(Button):
    """ Represents a GUI component that handles creation of new files"""
    def __init__(self, canvas, *args, **kwargs):
        super().__init__(*args, **kwargs, command=self.create_new_file)
        self.canvas = canvas

    def create_new_file(self):
        """Create a container in the canvas containing the image located at filepath """
        [self.canvas.delete(c.id) for c in self.canvas.containers]
        self.canvas.containers = []


class ImageImporter(Button):
    """ Represents a GUI component that handles importing of images"""
    def __init__(self, canvas, *args, **kwargs):
        super().__init__(*args, **kwargs, command=self.open)
        self.canvas = canvas

    def open(self):
        """Create a container in the canvas containing the image located at filepath """
        filepath = askopenfilename(filetypes=[e.value for e in ImageExtension])

        if not filepath:
            return

        self.canvas.containers.append(Container(self.canvas, image_path=filepath))


class ImageExporter(Button):
    """ Represents a GUI component that handles the saving of images"""
    def __init__(self, canvas, *args, **kwargs):
        super().__init__(*args, **kwargs, command=self.save)
        self.canvas = canvas

    def save(self):
        """Create a container in the canvas containing the image located at filepath """
        filepath = asksaveasfilename(
            defaultextension=DEFAULT_IMAGE_EXTENSION,
            filetypes=[e.value for e in ImageExtension],
        )

        if not filepath:
            return

        # save the canvas
        # TODO: this feels hacky, investigate if I can directly export to PNG
        self.canvas.postscript(file=f'{filepath}.ps')
        img = Image.open(f'{filepath}.ps')
        img.save(filepath)
        remove(f'{filepath}.ps')


class FileOpener(Button):
    """ Represents a GUI component that handles opening of .hv files"""
    def __init__(self, canvas, *args, **kwargs):
        super().__init__(*args, **kwargs, command=self.open)
        self.canvas = canvas

    def open(self):
        """Open a file for editing."""
        filepath = askopenfilename(filetypes=[e.value for e in PhotonExtension])

        if not filepath:
            return

        # remove old objects
        [self.canvas.delete(c.id) for c in self.canvas.containers]
        self.canvas.containers = []

        # create new objects
        with open(filepath, 'r') as f:
            content = json.loads(f.read())

        # append all images to the list containers
        [self.canvas.containers.append(Container(self.canvas, c['image'], *c['location'])) for c in content]

        # fire an file updated event
        self.event_generate('<<FileUpdated>>', data=filepath, when='tail')


class FileSaver(Button):
    """ Represents a GUI component that handles saving of files """
    def __init__(self, canvas, *args, **kwargs):
        super().__init__(*args, **kwargs, command=self.save_file_as)
        self.canvas = canvas

    def save_file_as(self):
        """Save the current file as a new file."""
        filepath = asksaveasfilename(
            defaultextension=DEFAULT_PHOTON_EXTENSION,
            filetypes=[e.value for e in PhotonExtension],
        )

        if not filepath:
            return

        # save photon file
        content = [
            {
                'image': join(getcwd(), c.image_path),
                'location': self.canvas.coords(c.id)
            } for c in self.canvas.containers
        ]

        with open(filepath, 'w') as f:
            f.write(json.dumps(content))

        # fire an file updated event
        self.event_generate('<<FileUpdated>>', data=filepath, when='tail')


# TODO: deleteme
class Reset(Button):
    """ Represents a GUI component that resets to test"""
    def __init__(self, canvas, *args, **kwargs):
        super().__init__(*args, **kwargs, command=self.open)
        self.canvas = canvas

    def open(self):
        """Open a file for editing."""
        # remove old objects
        [self.canvas.delete(c.id) for c in self.canvas.containers]
        self.canvas.containers = []

        # create new objects
        with open(join('data', 'test.hv'), 'r') as f:
            content = json.loads(f.read())

        # append all images to the list containers
        [self.canvas.containers.append(Container(self.canvas, c['image'], *c['location'])) for c in content]
