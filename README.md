# matthazley.com

CV and details for me, Matt Hazley. [Reach out](mailto:hello@matthazley.com) anytime.

Powered by Hugo & Github Pages.

## Developing

### Install

Dependencies are defined in environment.yml and managed with [conda](https://docs.conda.io/)

```
conda env create -f environment.yml
conda activate matthazley-com
```

To pick up changes to environment.yml later:

```
conda env update -f environment.yml --prune
```


### Run

```
cd ./scripts
python pdfcv.py

# Check for ./scripts/cv.pdf
```
